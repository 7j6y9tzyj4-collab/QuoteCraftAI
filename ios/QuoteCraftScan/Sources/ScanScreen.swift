import SwiftUI
import RoomPlan
import ARKit
import CoreImage
import UIKit

// Екран сканування: RoomCaptureView + кнопки «Готово / Скасувати».
// Під час сканування сам робить до 30 кадрів з різних напрямків і запам'ятовує, куди дивився телефон.
struct ScanScreen: View {
    let onFinish: (CapturedRoom?, [ScanShot]) -> Void
    @StateObject private var ctl = CaptureController()

    var body: some View {
        ZStack(alignment: .bottom) {
            CaptureView(ctl: ctl).ignoresSafeArea()
            VStack(spacing: 10) {
                Text("📸 Кадрів: \(ctl.shotCount)/\(CaptureController.maxShots)").font(.footnote.bold()).padding(.horizontal, 10).padding(.vertical, 4).background(.ultraThinMaterial).cornerRadius(8)
                if ctl.processing { ProgressView("Обробляю…").padding(10).background(.ultraThinMaterial).cornerRadius(10) }
                HStack {
                    Button("Скасувати") { ctl.stop(); onFinish(nil, []) }.buttonStyle(.bordered)
                    Spacer()
                    Button("Готово") { ctl.finish() }.buttonStyle(.borderedProminent).disabled(ctl.processing)
                }.padding()
            }
        }
        .onAppear { ctl.start() }
        .onDisappear { ctl.timer?.invalidate() }
        .onChange(of: ctl.resultTick) { _, _ in if let r = ctl.result { onFinish(r, ctl.shots) } }
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
    var result: CapturedRoom? = nil
    var shots: [ScanShot] = []
    var timer: Timer?
    let view = RoomCaptureView(frame: .zero)
    private var finishing = false
    private let ci = CIContext()
    private var lastShotAt = Date.distantPast

    override init() { super.init(); view.delegate = self; view.captureSession.delegate = self }
    func start() {
        shots = []; shotCount = 0
        view.captureSession.run(configuration: RoomCaptureSession.Configuration())
        timer = Timer.scheduledTimer(withTimeInterval: 0.7, repeats: true) { [weak self] _ in self?.maybeShoot() }
    }
    func stop() { timer?.invalidate(); view.captureSession.stop() }
    func finish() { timer?.invalidate(); finishing = true; processing = true; view.captureSession.stop() }

    // Знімаємо кадр, якщо це новий ракурс: інший напрямок (≥ 20°) або та сама сторона, але з іншого місця (≥ 0.9 м) — і телефон тримається рівно
    private func maybeShoot() {
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
