import SwiftUI
import UIKit
import RoomPlan

// Сканування → відправка в QuoteCraft за токеном заявки (той самий протокол, що й у застосунку QuoteCraft Scan).
@available(iOS 17.0, *)
enum ScanStage { case scanning, sending, failed, done }

@available(iOS 17.0, *)
final class ScanFlow: ObservableObject {
    let token: String
    let api: String
    @Published var stage: ScanStage = .scanning
    @Published var status: String = ""
    private var payload: [String: Any] = [:]
    private var shots: [ScanShot] = []
    private var cloud: Data? = nil

    init(token: String, api: String) { self.token = token; self.api = api }

    func send(_ res: ScanResult) {
        var j = RoomJSON.build(res.room)
        j["app"] = "QuoteCraft/scan-1"
        j["_shots"] = res.shots.count
        j["_points"] = res.cloud.map { ($0.count - 8) / 9 } ?? 0
        payload = j; shots = res.shots; cloud = res.cloud
        upload()
    }
    func retry() { upload() }

    private func upload() {
        stage = .sending
        uploadShots(i: 0, metas: []) { metas in
            self.uploadCloud { cloudInfo in
                var body = self.payload
                body["photos"] = metas
                if let cloudInfo { body["cloud"] = cloudInfo }
                self.status = "Відправляю план…"
                self.post("/api/scan-import", ["token": self.token, "scan": body]) { code, json, err in
                    if let err { self.fail("Нема зв'язку: " + err.localizedDescription); return }
                    if code == 200 { self.status = "✅ Відправлено"; self.stage = .done }
                    else { self.fail("Помилка \(code): " + ((json?["error"] as? String) ?? "")) }
                }
            }
        }
    }
    private func fail(_ text: String) { status = text; stage = .failed }

    private func post(_ path: String, _ body: [String: Any], _ done: @escaping (Int, [String: Any]?, Error?) -> Void) {
        guard let url = URL(string: api + path) else { done(0, nil, nil); return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"; req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 120
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: req) { data, resp, err in
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            DispatchQueue.main.async { done(code, json, err) }
        }.resume()
    }

    // Кадри по одному (кожен ~100 КБ) → шлях у сховищі + напрямок камери
    private func uploadShots(i: Int, metas: [[String: Any]], done: @escaping ([[String: Any]]) -> Void) {
        guard i < shots.count else { done(metas); return }
        status = "Відправляю кадр \(i + 1)/\(shots.count)…"
        let s = shots[i]
        post("/api/scan-photo", ["token": token, "idx": i, "jpg": s.jpeg.base64EncodedString()]) { code, json, _ in
            var m = metas
            if code == 200, let path = json?["path"] as? String { m.append(["path": path, "cx": s.cx, "cz": s.cz, "yaw": s.yaw, "pitch": s.pitch]) }
            self.uploadShots(i: i + 1, metas: m, done: done)
        }
    }

    // 3D-точки: великий файл → напряму в сховище за одноразовим посиланням (минаючи ліміт сервера)
    private func uploadCloud(done: @escaping ([String: Any]?) -> Void) {
        guard let cloud, cloud.count > 8 else { done(nil); return }
        status = String(format: "Відправляю 3D-точки (%.1f МБ)…", Double(cloud.count) / 1_000_000)
        post("/api/scan-cloud-url", ["token": token, "name": "cloud"]) { code, json, _ in
            guard code == 200, let up = json?["uploadUrl"] as? String, let path = json?["path"] as? String, let url = URL(string: up) else { done(nil); return }
            var req = URLRequest(url: url)
            req.httpMethod = "PUT"; req.timeoutInterval = 300
            req.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
            req.setValue("true", forHTTPHeaderField: "x-upsert")
            if let k = json?["apikey"] as? String, !k.isEmpty { req.setValue(k, forHTTPHeaderField: "apikey") }
            URLSession.shared.uploadTask(with: req, from: cloud) { _, resp, _ in
                let ok = ((resp as? HTTPURLResponse)?.statusCode ?? 0) == 200
                DispatchQueue.main.async { done(ok ? ["path": path, "n": (cloud.count - 8) / 9] : nil) }
            }.resume()
        }
    }
}

@available(iOS 17.0, *)
struct ScanFlowView: View {
    @ObservedObject var flow: ScanFlow
    let onClose: (Bool, String) -> Void

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if flow.stage == .scanning {
                ScanScreen { res in
                    if let res { flow.send(res) } else { onClose(false, "cancelled") }
                }
            } else {
                VStack(spacing: 18) {
                    if flow.stage == .sending { ProgressView().tint(.white).controlSize(.large) }
                    Text(flow.status).foregroundColor(.white).multilineTextAlignment(.center)
                    if flow.stage == .failed {
                        Button("Спробувати ще раз") { flow.retry() }.buttonStyle(.borderedProminent)
                        Button("Закрити") { onClose(false, flow.status) }.buttonStyle(.bordered)
                    }
                }.padding(24)
            }
        }
        .onReceive(flow.$stage) { st in if st == .done { onClose(true, "sent") } }
    }
}
