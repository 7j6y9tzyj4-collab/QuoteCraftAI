import SwiftUI
import RoomPlan

// Екран сканування: RoomCaptureView + кнопки «Готово / Скасувати».
struct ScanScreen: View {
    let onFinish: (CapturedRoom?) -> Void
    @StateObject private var ctl = CaptureController()

    var body: some View {
        ZStack(alignment: .bottom) {
            CaptureView(ctl: ctl).ignoresSafeArea()
            VStack(spacing: 10) {
                if ctl.processing { ProgressView("Обробляю…").padding(10).background(.ultraThinMaterial).cornerRadius(10) }
                HStack {
                    Button("Скасувати") { ctl.stop(); onFinish(nil) }.buttonStyle(.bordered)
                    Spacer()
                    Button("Готово") { ctl.finish() }.buttonStyle(.borderedProminent).disabled(ctl.processing)
                }.padding()
            }
        }
        .onAppear { ctl.start() }
        .onChange(of: ctl.resultTick) { _, _ in if let r = ctl.result { onFinish(r) } }
    }
}

final class CaptureController: NSObject, ObservableObject, RoomCaptureViewDelegate, RoomCaptureSessionDelegate {
    @Published var processing = false
    @Published var resultTick = 0
    var result: CapturedRoom? = nil
    let view = RoomCaptureView(frame: .zero)
    private var finishing = false

    override init() { super.init(); view.delegate = self; view.captureSession.delegate = self }
    func start() { view.captureSession.run(configuration: RoomCaptureSession.Configuration()) }
    func stop() { view.captureSession.stop() }
    func finish() { finishing = true; processing = true; view.captureSession.stop() }

    // RoomCaptureViewDelegate
    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool { true }
    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        DispatchQueue.main.async { self.processing = false; if self.finishing { self.result = processedResult; self.resultTick += 1 } }
    }
    // NSCoding заглушки (вимагає протокол)
    func encode(with coder: NSCoder) {}
    required init?(coder: NSCoder) { nil }
}

struct CaptureView: UIViewRepresentable {
    let ctl: CaptureController
    func makeUIView(context: Context) -> RoomCaptureView { ctl.view }
    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}
}
