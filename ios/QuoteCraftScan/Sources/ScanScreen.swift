import SwiftUI
import RoomPlan
import ARKit
import Metal
import CoreImage
import UIKit

// Екран сканування: RoomCaptureView + кнопки «Готово / Скасувати».
// Під час сканування сам робить до 30 кадрів з різних напрямків і запам'ятовує, куди дивився телефон.
struct ScanScreen: View {
    let onFinish: (CapturedRoom?, [ScanShot], Data?) -> Void
    @StateObject private var ctl = CaptureController()

    var body: some View {
        ZStack(alignment: .bottom) {
            CaptureView(ctl: ctl).ignoresSafeArea()
            VStack(spacing: 10) {
                Text("📸 Кадрів: \(ctl.shotCount)/\(CaptureController.maxShots) · 🧊 точок: \(ctl.pointCount / 1000)k").font(.footnote.bold()).padding(.horizontal, 10).padding(.vertical, 4).background(.ultraThinMaterial).cornerRadius(8)
                if ctl.processing { ProgressView("Обробляю…").padding(10).background(.ultraThinMaterial).cornerRadius(10) }
                HStack {
                    Button("Скасувати") { ctl.stop(); onFinish(nil, [], nil) }.buttonStyle(.bordered)
                    Spacer()
                    Button("Готово") { ctl.finish() }.buttonStyle(.borderedProminent).disabled(ctl.processing)
                }.padding()
            }
        }
        .onAppear { ctl.start() }
        .onDisappear { ctl.timer?.invalidate() }
        .onChange(of: ctl.resultTick) { _, _ in if let r = ctl.result { onFinish(r, ctl.shots, ctl.cloud.encoded()) } }
    }
}

/// Кадр зі сканера: JPEG + положення камери і напрямок погляду (у координатах ARKit, як і CapturedRoom).
struct ScanShot {
    let jpeg: Data
    let cx: Double, cz: Double, yaw: Double, pitch: Double
}

final class CaptureController: NSObject, ObservableObject, RoomCaptureViewDelegate, RoomCaptureSessionDelegate {
    static let maxShots = 30
    @Published var processing = false
    @Published var resultTick = 0
    @Published var shotCount = 0
    @Published var pointCount = 0
    let cloud = PointCloud()
    private var tick = 0
    var result: CapturedRoom? = nil
    var shots: [ScanShot] = []
    var timer: Timer?
    let view = RoomCaptureView(frame: .zero)
    private var finishing = false
    private let ci = CIContext()
    private var lastShotAt = Date.distantPast

    override init() { super.init(); view.delegate = self; view.captureSession.delegate = self }
    func start() {
        shots = []; shotCount = 0; cloud.reset(); pointCount = 0
        view.captureSession.run(configuration: RoomCaptureSession.Configuration())
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in self?.maybeShoot() }
    }
    func stop() { timer?.invalidate(); view.captureSession.stop() }
    func finish() { timer?.invalidate(); finishing = true; processing = true; view.captureSession.stop() }

    // Знімаємо кадр, якщо це новий ракурс: інший напрямок (≥ 20°) або та сама сторона, але з іншого місця (≥ 0.9 м) — і телефон тримається рівно
    private func maybeShoot() {
        // 3D-скан (як у Roborock): точки з LiDAR-глибини з кольором з камери; без глибини — вершини сітки ARKit
        if let f = view.captureSession.arSession.currentFrame, case .normal = f.camera.trackingState {
            tick += 1
            cloud.add(frame: f, meshToo: tick % 4 == 0) { n in DispatchQueue.main.async { self.pointCount = n } }
        }
        guard shots.count < Self.maxShots, Date().timeIntervalSince(lastShotAt) > 0.9,
              let frame = view.captureSession.arSession.currentFrame,
              case .normal = frame.camera.trackingState else { return }
        let t = frame.camera.transform
        let fwd = SIMD3<Float>(-t.columns.2.x, -t.columns.2.y, -t.columns.2.z)
        let yaw = Double(atan2(fwd.z, fwd.x))
        let pitch = Double(asin(max(-1, min(1, fwd.y))))
        guard abs(pitch) < 0.5 else { return } // не стеля і не підлога
        let px = Double(t.columns.3.x), pz = Double(t.columns.3.z)
        for s in shots {
            var d = abs(s.yaw - yaw); if d > .pi { d = 2 * .pi - d }
            let dist = ((s.cx - px) * (s.cx - px) + (s.cz - pz) * (s.cz - pz)).squareRoot()
            if d < 20 * .pi / 180 && dist < 0.9 { return }
        }
        guard let jpeg = jpegFrom(frame.capturedImage) else { return }
        shots.append(ScanShot(jpeg: jpeg, cx: Double(t.columns.3.x), cz: Double(t.columns.3.z), yaw: yaw, pitch: pitch))
        lastShotAt = Date()
        DispatchQueue.main.async { self.shotCount = self.shots.count }
    }
    private func jpegFrom(_ buf: CVPixelBuffer) -> Data? {
        let img = CIImage(cvPixelBuffer: buf).oriented(.right)
        let scale = 1000.0 / max(img.extent.width, img.extent.height)
        let small = img.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        guard let cg = ci.createCGImage(small, from: small.extent) else { return nil }
        return UIImage(cgImage: cg).jpegData(compressionQuality: 0.7)
    }

    // RoomCaptureViewDelegate
    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool { true }
    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        DispatchQueue.main.async { self.processing = false; if self.finishing { self.result = processedResult; self.resultTick += 1 } }
    }
    func encode(with coder: NSCoder) {}
    required init?(coder: NSCoder) { nil }
}

struct CaptureView: UIViewRepresentable {
    let ctl: CaptureController
    func makeUIView(context: Context) -> RoomCaptureView { ctl.view }
    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}
}


/// Хмара точок кімнати: вокселі 2 см, колір з камери. Формат для QuoteCraft: "QCPC" + UInt32 n + n × (Int16 x,y,z у мм, UInt8 r,g,b), little-endian, координати ARKit.
final class PointCloud {
    static let maxPoints = 330_000
    private let q = DispatchQueue(label: "pointcloud")
    private var keys = Set<Int64>()
    private var data = Data()
    private var count = 0
    private var busy = false
    func reset() { q.sync { keys.removeAll(); data = Data(); count = 0 } }
    func encoded() -> Data? {
        q.sync { () -> Data? in
            guard count > 500 else { return nil }
            var out = Data("QCPC".utf8)
            var n = UInt32(count).littleEndian
            withUnsafeBytes(of: &n) { out.append(contentsOf: $0) }
            out.append(data)
            return out
        }
    }
    private func put(_ p: simd_float3, _ r: UInt8, _ g: UInt8, _ b: UInt8) {
        guard count < Self.maxPoints, abs(p.x) < 30, abs(p.y) < 30, abs(p.z) < 30 else { return }
        let k = (Int64((p.x * 50).rounded()) & 0x1FFFFF) << 42 | (Int64((p.y * 50).rounded()) & 0x1FFFFF) << 21 | (Int64((p.z * 50).rounded()) & 0x1FFFFF)
        guard keys.insert(k).inserted else { return }
        for c in [p.x, p.y, p.z] {
            var le = Int16((c * 1000).rounded()).littleEndian
            withUnsafeBytes(of: &le) { data.append(contentsOf: $0) }
        }
        data.append(contentsOf: [r, g, b])
        count += 1
    }
    /// колір пікселя (U,V) кадру камери (YCbCr 4:2:0 → RGB)
    private static func rgb(_ img: CVPixelBuffer, _ u: Int, _ v: Int) -> (UInt8, UInt8, UInt8)? {
        let w = CVPixelBufferGetWidthOfPlane(img, 0), h = CVPixelBufferGetHeightOfPlane(img, 0)
        guard u >= 0, v >= 0, u < w, v < h, let yb = CVPixelBufferGetBaseAddressOfPlane(img, 0), let cb = CVPixelBufferGetBaseAddressOfPlane(img, 1) else { return nil }
        let ys = CVPixelBufferGetBytesPerRowOfPlane(img, 0), cs = CVPixelBufferGetBytesPerRowOfPlane(img, 1)
        let Y = Float(yb.load(fromByteOffset: v * ys + u, as: UInt8.self))
        let Cb = Float(cb.load(fromByteOffset: (v / 2) * cs + (u / 2) * 2, as: UInt8.self)) - 128
        let Cr = Float(cb.load(fromByteOffset: (v / 2) * cs + (u / 2) * 2 + 1, as: UInt8.self)) - 128
        func c(_ x: Float) -> UInt8 { UInt8(max(0, min(255, x))) }
        return (c(Y + 1.402 * Cr), c(Y - 0.344136 * Cb - 0.714136 * Cr), c(Y + 1.772 * Cb))
    }
    func add(frame: ARFrame, meshToo: Bool, progress: @escaping (Int) -> Void) {
        if busy { return }
        busy = true
        let depth = frame.sceneDepth ?? frame.smoothedSceneDepth
        let img = frame.capturedImage
        let cam = frame.camera
        let meshes = (depth == nil || meshToo) ? frame.anchors.compactMap { $0 as? ARMeshAnchor } : []
        q.async {
            defer { self.busy = false; progress(self.count) }
            CVPixelBufferLockBaseAddress(img, .readOnly); defer { CVPixelBufferUnlockBaseAddress(img, .readOnly) }
            let iw = Float(CVPixelBufferGetWidthOfPlane(img, 0)), ih = Float(CVPixelBufferGetHeightOfPlane(img, 0))
            let K = cam.intrinsics, T = cam.transform, Ti = cam.transform.inverse
            if let depth {
                let dm = depth.depthMap
                CVPixelBufferLockBaseAddress(dm, .readOnly); defer { CVPixelBufferUnlockBaseAddress(dm, .readOnly) }
                var cmBase: UnsafeMutableRawPointer? = nil, cmStride = 0
                if let cm = depth.confidenceMap { CVPixelBufferLockBaseAddress(cm, .readOnly); cmBase = CVPixelBufferGetBaseAddress(cm); cmStride = CVPixelBufferGetBytesPerRow(cm) }
                defer { if let cm = depth.confidenceMap { CVPixelBufferUnlockBaseAddress(cm, .readOnly) } }
                let dw = CVPixelBufferGetWidth(dm), dh = CVPixelBufferGetHeight(dm), ds = CVPixelBufferGetBytesPerRow(dm)
                guard let db = CVPixelBufferGetBaseAddress(dm) else { return }
                let sx = iw / Float(dw), sy = ih / Float(dh)
                var y = 0
                while y < dh {
                    var x = 0
                    while x < dw {
                        let z = db.load(fromByteOffset: y * ds + x * 4, as: Float32.self)
                        let conf = cmBase.map { $0.load(fromByteOffset: y * cmStride + x, as: UInt8.self) } ?? 2
                        if z > 0.15, z < 4.5, conf >= 2 {
                            let U = (Float(x) + 0.5) * sx, V = (Float(y) + 0.5) * sy
                            let xc = (U - K[2][0]) / K[0][0] * z, yc = (V - K[2][1]) / K[1][1] * z
                            let w = T * simd_float4(xc, -yc, -z, 1)
                            if let c = Self.rgb(img, Int(U), Int(V)) { self.put(simd_float3(w.x, w.y, w.z), c.0, c.1, c.2) }
                        }
                        x += 2
                    }
                    y += 2
                }
            }
            // запасний варіант: вершини сітки, видимі в цьому кадрі
            for a in meshes {
                let g = a.geometry.vertices
                let ptr = g.buffer.contents()
                for i in 0..<g.count {
                    let v = ptr.advanced(by: g.offset + g.stride * i).assumingMemoryBound(to: (Float, Float, Float).self).pointee
                    let w = a.transform * simd_float4(v.0, v.1, v.2, 1)
                    let pc = Ti * w
                    guard pc.z < -0.15, pc.z > -4.5 else { continue }
                    let U = (pc.x / -pc.z) * K[0][0] + K[2][0], V = (-pc.y / -pc.z) * K[1][1] + K[2][1]
                    if U < 0 || V < 0 || U >= iw || V >= ih { continue }
                    if let c = Self.rgb(img, Int(U), Int(V)) { self.put(simd_float3(w.x, w.y, w.z), c.0, c.1, c.2) }
                }
            }
        }
    }
}
