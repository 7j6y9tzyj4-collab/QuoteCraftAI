import SwiftUI
import RoomPlan
import ARKit
import SceneKit
import Metal
import CoreImage
import UIKit

// Екран сканування у 2 кроки:
// 1) план (Apple RoomPlan) + до 30 кадрів для AI + хмара точок;
// 2) «3D-фото»: на тій самій AR-сесії (ті самі координати) — суцільна сітка кімнати з LiDAR і до 40 чітких кадрів у повній якості,
//    з яких сайт «натягує» фото на сітку (як Polycam/Scaniverse).
struct ScanResult {
    let room: CapturedRoom
    let shots: [ScanShot]
    let cloud: Data?
    let mesh: Data?
    let frames: [KeyFrame]
}
struct ScanScreen: View {
    let onFinish: (ScanResult?) -> Void
    @StateObject private var ctl = CaptureController()

    var body: some View {
        ZStack(alignment: .bottom) {
            if ctl.phase == 2 { PhotoView(ctl: ctl).ignoresSafeArea() } else { CaptureView(ctl: ctl).ignoresSafeArea() }
            VStack(spacing: 10) {
                if ctl.phase == 2 {
                    Text("Крок 2/2 — 3D-фото. Повільно обійди кімнату ще раз, наводь на меблі й стіни з різних боків. Не поспішай — кадри мають бути чіткі.")
                        .font(.footnote).multilineTextAlignment(.center).padding(10).background(.ultraThinMaterial).cornerRadius(10).padding(.horizontal)
                    if !ctl.hint.isEmpty { Text(ctl.hint).font(.footnote.bold()).foregroundStyle(.orange).padding(8).background(.ultraThinMaterial).cornerRadius(8) }
                    Text("📷 Кадрів: \(ctl.frameCount)/\(CaptureController.maxFrames) · 🔺 сітка: \(ctl.meshFaces / 1000)k").font(.footnote.bold()).padding(.horizontal, 10).padding(.vertical, 4).background(.ultraThinMaterial).cornerRadius(8)
                } else {
                    Text("Крок 1/2 — план · 📸 \(ctl.shotCount)/\(CaptureController.maxShots) · 🧊 \(ctl.pointCount / 1000)k").font(.footnote.bold()).padding(.horizontal, 10).padding(.vertical, 4).background(.ultraThinMaterial).cornerRadius(8)
                }
                if ctl.processing { ProgressView("Обробляю…").padding(10).background(.ultraThinMaterial).cornerRadius(10) }
                HStack {
                    Button("Скасувати") { ctl.stop(); onFinish(nil) }.buttonStyle(.bordered)
                    Spacer()
                    if ctl.phase == 2 { Button("Без 3D-фото") { onFinish(ctl.output(withMesh: false)) }.buttonStyle(.bordered) }
                    Button(ctl.phase == 2 ? "Готово" : "Далі →") {
                        if ctl.phase == 2 { ctl.timer?.invalidate(); ctl.processing = true; DispatchQueue.global(qos: .userInitiated).async { let r = ctl.output(withMesh: true); DispatchQueue.main.async { ctl.processing = false; onFinish(r) } } }
                        else { ctl.finish() }
                    }.buttonStyle(.borderedProminent).disabled(ctl.processing)
                }.padding()
            }
        }
        .onAppear { ctl.start() }
        .onDisappear { ctl.stop() }
    }
}

/// Кадр зі сканера: JPEG + положення камери і напрямок погляду (у координатах ARKit, як і CapturedRoom).
struct ScanShot {
    let jpeg: Data
    let cx: Double, cz: Double, yaw: Double, pitch: Double
}
/// Ключовий кадр для текстури: JPEG у повній якості (орієнтація сенсора, без повороту) + поза камери (4×4, по стовпцях) + внутрішні параметри
struct KeyFrame {
    let jpeg: Data
    let T: [Float]
    let fx: Float, fy: Float, cx: Float, cy: Float, w: Int, h: Int
}

final class CaptureController: NSObject, ObservableObject, RoomCaptureViewDelegate, RoomCaptureSessionDelegate, ARSessionDelegate {
    static let maxShots = 30
    static let maxFrames = 50
    @Published var processing = false
    @Published var phase = 1
    @Published var shotCount = 0
    @Published var pointCount = 0
    @Published var frameCount = 0
    @Published var meshFaces = 0
    @Published var hint = ""
    let cloud = PointCloud()
    private var tick = 0
    var result: CapturedRoom? = nil
    var shots: [ScanShot] = []
    var frames: [KeyFrame] = []
    var timer: Timer?
    let arSession = ARSession()
    let view: RoomCaptureView
    private var finishing = false
    private let ci = CIContext()
    private var lastShotAt = Date.distantPast
    private var lastFrameAt = Date.distantPast
    private var prevPose: simd_float4x4? = nil

    override init() {
        view = RoomCaptureView(frame: .zero, arSession: arSession)
        super.init(); view.delegate = self; view.captureSession.delegate = self
    }
    func start() {
        shots = []; frames = []; shotCount = 0; frameCount = 0; cloud.reset(); pointCount = 0; phase = 1
        view.captureSession.run(configuration: RoomCaptureSession.Configuration())
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in self?.maybeShoot() }
    }
    func stop() { timer?.invalidate(); if phase == 2 { arSession.pause() } else { view.captureSession.stop() } }
    // крок 1 → обробка плану; AR-сесію НЕ зупиняємо, щоб крок 2 був у тих самих координатах
    func finish() { timer?.invalidate(); finishing = true; processing = true; view.captureSession.stop(pauseARSession: false) }

    private func startPhoto() {
        // карта світу з кроку 1 → крок 2 «впізнає» кімнату і пише сітку й кадри в ТИХ САМИХ координатах, що й план
        arSession.getCurrentWorldMap { map, _ in DispatchQueue.main.async { self.runPhoto(map: map) } }
    }
    private func runPhoto(map: ARWorldMap?) {
        let cfg = ARWorldTrackingConfiguration()
        cfg.initialWorldMap = map
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.meshWithClassification) { cfg.sceneReconstruction = .meshWithClassification }
        else if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) { cfg.sceneReconstruction = .mesh }
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) { cfg.frameSemantics.insert(.sceneDepth) }
        if map != nil { arSession.run(cfg, options: [.resetTracking, .removeExistingAnchors]) } else { arSession.run(cfg) }
        phase = 2
        timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in self?.maybeKeyFrame() }
    }

    // Крок 1: кадр для AI, якщо новий ракурс (≥ 20° або ≥ 0.9 м від попередніх) і телефон рівно
    private func maybeShoot() {
        if let f = arSession.currentFrame, case .normal = f.camera.trackingState {
            tick += 1
            cloud.add(frame: f, meshToo: tick % 4 == 0) { n in DispatchQueue.main.async { self.pointCount = n } }
        }
        guard shots.count < Self.maxShots, Date().timeIntervalSince(lastShotAt) > 0.9,
              let frame = arSession.currentFrame,
              case .normal = frame.camera.trackingState else { return }
        let t = frame.camera.transform
        let fwd = SIMD3<Float>(-t.columns.2.x, -t.columns.2.y, -t.columns.2.z)
        let yaw = Double(atan2(fwd.z, fwd.x))
        let pitch = Double(asin(max(-1, min(1, fwd.y))))
        guard abs(pitch) < 0.5 else { return }
        let px = Double(t.columns.3.x), pz = Double(t.columns.3.z)
        for s in shots {
            var d = abs(s.yaw - yaw); if d > .pi { d = 2 * .pi - d }
            let dist = ((s.cx - px) * (s.cx - px) + (s.cz - pz) * (s.cz - pz)).squareRoot()
            if d < 20 * .pi / 180 && dist < 0.9 { return }
        }
        guard let jpeg = jpegFrom(frame.capturedImage, maxSide: 1000, rotate: true, q: 0.7) else { return }
        shots.append(ScanShot(jpeg: jpeg, cx: px, cz: pz, yaw: yaw, pitch: pitch))
        lastShotAt = Date()
        DispatchQueue.main.async { self.shotCount = self.shots.count }
    }

    // Крок 2: чіткий ключовий кадр, якщо новий ракурс (≥ 12° або ≥ 0.4 м) і телефон майже нерухомий (без змазу)
    private func maybeKeyFrame() {
        guard let frame = arSession.currentFrame else { return }
        guard case .normal = frame.camera.trackingState else {
            let h: String
            if case .limited(.relocalizing) = frame.camera.trackingState { h = "Наведи телефон на місце, звідки почав скан, — шукаю кімнату…" } else { h = "Тримай телефон рівно, повільно веди…" }
            DispatchQueue.main.async { self.hint = h }
            return
        }
        if !hint.isEmpty { DispatchQueue.main.async { self.hint = "" } }
        tick += 1
        if tick % 4 == 0 { let n = frame.anchors.compactMap { ($0 as? ARMeshAnchor)?.geometry.faces.count }.reduce(0, +); DispatchQueue.main.async { self.meshFaces = n } }
        let T = frame.camera.transform
        defer { prevPose = T }
        guard let prev = prevPose else { return }
        // кутова швидкість між тиками (0.25 с): кут між осями погляду + зсув
        let f0 = SIMD3<Float>(-prev.columns.2.x, -prev.columns.2.y, -prev.columns.2.z), f1 = SIMD3<Float>(-T.columns.2.x, -T.columns.2.y, -T.columns.2.z)
        let rot = acos(max(-1, min(1, simd_dot(simd_normalize(f0), simd_normalize(f1)))))
        let mv = simd_distance(SIMD3<Float>(prev.columns.3.x, prev.columns.3.y, prev.columns.3.z), SIMD3<Float>(T.columns.3.x, T.columns.3.y, T.columns.3.z))
        guard rot < 2.5 * .pi / 180, mv < 0.05, frames.count < Self.maxFrames, Date().timeIntervalSince(lastFrameAt) > 0.6 else { return }
        let pos = SIMD3<Float>(T.columns.3.x, T.columns.3.y, T.columns.3.z)
        for k in frames {
            let kf = SIMD3<Float>(-k.T[8], -k.T[9], -k.T[10]), kp = SIMD3<Float>(k.T[12], k.T[13], k.T[14])
            let a = acos(max(-1, min(1, simd_dot(simd_normalize(kf), simd_normalize(f1)))))
            if a < 12 * .pi / 180 && simd_distance(kp, pos) < 0.4 { return }
        }
        let img = frame.capturedImage
        let w = CVPixelBufferGetWidth(img), h = CVPixelBufferGetHeight(img)
        guard let jpeg = jpegFrom(img, maxSide: CGFloat(max(w, h)), rotate: false, q: 0.72) else { return }
        let K = frame.camera.intrinsics
        var m: [Float] = []
        for c in [T.columns.0, T.columns.1, T.columns.2, T.columns.3] { m += [c.x, c.y, c.z, c.w] }
        frames.append(KeyFrame(jpeg: jpeg, T: m, fx: K[0][0], fy: K[1][1], cx: K[2][0], cy: K[2][1], w: w, h: h))
        lastFrameAt = Date()
        DispatchQueue.main.async { self.frameCount = self.frames.count }
    }

    private func jpegFrom(_ buf: CVPixelBuffer, maxSide: CGFloat, rotate: Bool, q: CGFloat) -> Data? {
        var img = CIImage(cvPixelBuffer: buf)
        if rotate { img = img.oriented(.right) }
        let scale = min(1, maxSide / max(img.extent.width, img.extent.height))
        let small = scale < 1 ? img.transformed(by: CGAffineTransform(scaleX: scale, y: scale)) : img
        guard let cg = ci.createCGImage(small, from: small.extent) else { return nil }
        return UIImage(cgImage: cg).jpegData(compressionQuality: q)
    }

    /// Сітка з LiDAR → "QCMS" + UInt32 nv + UInt32 nf + nv×3 Float32 (світ, метри) + nf×3 UInt32 + nf×UInt8 (клас: 0 нема, 1 стіна, 2 підлога, 3 стеля, 4 стіл, 5 сидіння, 6 вікно, 7 двері)
    private func meshData() -> Data? {
        guard let anchors = arSession.currentFrame?.anchors.compactMap({ $0 as? ARMeshAnchor }), !anchors.isEmpty else { return nil }
        var pos = Data(), idx = Data(), cls = Data()
        var nv: UInt32 = 0, nf: UInt32 = 0
        for a in anchors {
            let g = a.geometry, vs = g.vertices, fs = g.faces
            let vp = vs.buffer.contents()
            for i in 0..<vs.count {
                let v = vp.advanced(by: vs.offset + vs.stride * i).assumingMemoryBound(to: (Float, Float, Float).self).pointee
                let w = a.transform * simd_float4(v.0, v.1, v.2, 1)
                for c in [w.x, w.y, w.z] { var le = c.bitPattern.littleEndian; withUnsafeBytes(of: &le) { pos.append(contentsOf: $0) } }
            }
            let fp = fs.buffer.contents()
            let per = fs.indexCountPerPrimitive, bpi = fs.bytesPerIndex
            for f in 0..<fs.count {
                for j in 0..<per {
                    let o = (f * per + j) * bpi
                    let ix: UInt32 = bpi == 4 ? fp.load(fromByteOffset: o, as: UInt32.self) : UInt32(fp.load(fromByteOffset: o, as: UInt16.self))
                    var le = (ix + nv).littleEndian; withUnsafeBytes(of: &le) { idx.append(contentsOf: $0) }
                }
                var c: UInt8 = 0
                if let cs = g.classification { c = cs.buffer.contents().advanced(by: cs.offset + cs.stride * f).load(as: UInt8.self) }
                cls.append(c)
            }
            nv += UInt32(vs.count); nf += UInt32(fs.count)
        }
        guard nf > 100 else { return nil }
        var out = Data("QCMS".utf8)
        var a = nv.littleEndian, b = nf.littleEndian
        withUnsafeBytes(of: &a) { out.append(contentsOf: $0) }; withUnsafeBytes(of: &b) { out.append(contentsOf: $0) }
        out.append(pos); out.append(idx); out.append(cls)
        return out
    }

    func output(withMesh: Bool) -> ScanResult? {
        if Thread.isMainThread { timer?.invalidate() }
        guard let r = result else { return nil }
        let mesh = withMesh ? meshData() : nil
        arSession.pause()
        return ScanResult(room: r, shots: shots, cloud: cloud.encoded(room: r), mesh: mesh, frames: withMesh ? frames : [])
    }

    // RoomCaptureViewDelegate
    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool { true }
    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        DispatchQueue.main.async {
            self.processing = false
            if self.finishing && self.phase == 1 { self.result = processedResult; self.startPhoto() }
        }
    }
    func encode(with coder: NSCoder) {}
    required init?(coder: NSCoder) { nil }
}

struct CaptureView: UIViewRepresentable {
    let ctl: CaptureController
    func makeUIView(context: Context) -> RoomCaptureView { ctl.view }
    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}
}
/// Камера для кроку 2 (та сама AR-сесія)
struct PhotoView: UIViewRepresentable {
    let ctl: CaptureController
    func makeUIView(context: Context) -> ARSCNView { let v = ARSCNView(frame: .zero); v.session = ctl.arSession; v.automaticallyUpdatesLighting = false; return v }
    func updateUIView(_ uiView: ARSCNView, context: Context) {}
}

/// Хмара точок кімнати: вокселі 1 см, колір з камери. Формат для QuoteCraft: "QCPC" + UInt32 n + n × (Int16 x,y,z у мм, UInt8 r,g,b), little-endian, координати ARKit.
final class PointCloud {
    static let maxPoints = 3_000_000   // у пам'яті під час скану
    static let maxOut = 2_200_000      // у файлі (≈ 20 МБ)
    private let q = DispatchQueue(label: "pointcloud")
    private var keys = Set<Int64>()
    private var data = Data()
    private var count = 0
    private var busy = false
    func reset() { q.sync { keys.removeAll(); data = Data(); count = 0 } }
    /// Файл для QuoteCraft: прибираємо точки стін, підлоги й стелі (їх малює сама кімната) — лишаються предмети; максимум maxOut точок.
    func encoded(room: CapturedRoom?) -> Data? {
        q.sync { () -> Data? in
            guard count > 500 else { return nil }
            var walls: [(simd_float4x4, simd_float3)] = []
            var floorY: Float = -1000, topY: Float = 1000
            if let room, !room.walls.isEmpty {
                walls = room.walls.map { ($0.transform.inverse, $0.dimensions) }
                floorY = room.walls.map { $0.transform.columns.3.y - $0.dimensions.y / 2 }.min() ?? -1000
                topY = room.walls.map { $0.transform.columns.3.y + $0.dimensions.y / 2 }.max() ?? 1000
            }
            var keep = Data(); keep.reserveCapacity(min(count, Self.maxOut) * 9)
            var n = 0
            data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
                for i in 0..<count {
                    let o = i * 9
                    let x = Float(Int16(littleEndian: raw.loadUnaligned(fromByteOffset: o, as: Int16.self))) / 1000
                    let y = Float(Int16(littleEndian: raw.loadUnaligned(fromByteOffset: o + 2, as: Int16.self))) / 1000
                    let z = Float(Int16(littleEndian: raw.loadUnaligned(fromByteOffset: o + 4, as: Int16.self))) / 1000
                    if y < floorY + 0.015 || y > topY - 0.04 { continue }
                    var onWall = false
                    for (inv, d) in walls {
                        let l = inv * simd_float4(x, y, z, 1)
                        if abs(l.z) < 0.035 && abs(l.x) < d.x / 2 + 0.03 && abs(l.y) < d.y / 2 + 0.03 { onWall = true; break }
                    }
                    if onWall { continue }
                    keep.append(contentsOf: raw[o..<(o + 9)])
                    n += 1
                }
            }
            // забагато — проріджуємо рівномірно
            if n > Self.maxOut {
                let step = Double(n) / Double(Self.maxOut)
                var thin = Data(); thin.reserveCapacity(Self.maxOut * 9)
                var t = 0.0
                while Int(t) < n && thin.count < Self.maxOut * 9 { let o = Int(t) * 9; thin.append(keep[o..<(o + 9)]); t += step }
                keep = thin; n = thin.count / 9
            }
            var out = Data("QCPC".utf8)
            var nn = UInt32(n).littleEndian
            withUnsafeBytes(of: &nn) { out.append(contentsOf: $0) }
            out.append(keep)
            return out
        }
    }
    private func put(_ p: simd_float3, _ r: UInt8, _ g: UInt8, _ b: UInt8) {
        guard count < Self.maxPoints, abs(p.x) < 30, abs(p.y) < 30, abs(p.z) < 30 else { return }
        let k = (Int64((p.x * 100).rounded()) & 0x1FFFFF) << 42 | (Int64((p.y * 100).rounded()) & 0x1FFFFF) << 21 | (Int64((p.z * 100).rounded()) & 0x1FFFFF)
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
                        x += 1
                    }
                    y += 1
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
