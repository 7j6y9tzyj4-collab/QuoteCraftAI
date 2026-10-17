import SwiftUI

// QuoteCraft Scan — LiDAR-скан кімнати (Apple RoomPlan) → QuoteCraft.
// Відкривається з вебу посиланням quotecraftscan://scan?token=…&api=https://… ; без токена теж працює (показує результат).
@main
struct QuoteCraftScanApp: App {
    @StateObject private var session = ScanSession()
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(session)
                .onOpenURL { url in session.handle(url: url) }
        }
    }
}

final class ScanSession: ObservableObject {
    @Published var token: String? = nil
    @Published var api: String = "https://quotecraftai-app.vercel.app"
    @Published var status: String = ""
    @Published var payload: [String: Any]? = nil
    @Published var sending = false
    @Published var sent = false

    func handle(url: URL) {
        guard let c = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        token = c.queryItems?.first(where: { $0.name == "token" })?.value
        if let a = c.queryItems?.first(where: { $0.name == "api" })?.value, a.hasPrefix("https://") { api = a }
        payload = nil; sent = false; status = token == nil ? "" : "Готово до сканування"
    }

    func send() {
        guard let token, let payload, !sending else { return }
        sending = true; status = "Відправляю…"
        var req = URLRequest(url: URL(string: api + "/api/scan-import")!)
        req.httpMethod = "POST"; req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["token": token, "scan": payload])
        URLSession.shared.dataTask(with: req) { data, resp, err in
            DispatchQueue.main.async {
                self.sending = false
                if let err { self.status = "Помилка: " + err.localizedDescription; return }
                let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
                if code == 200 { self.sent = true; self.status = "✅ Відправлено в QuoteCraft. Повернись у браузер." }
                else {
                    let msg = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }?["error"] as? String
                    self.status = "Помилка \(code): " + (msg ?? "")
                }
            }
        }.resume()
    }
}
