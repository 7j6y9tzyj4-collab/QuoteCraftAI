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
    @Published var pin: String = ""
    @Published var claiming = false

    func handle(url: URL) {
        guard let c = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        token = c.queryItems?.first(where: { $0.name == "token" })?.value
        if let a = c.queryItems?.first(where: { $0.name == "api" })?.value, a.hasPrefix("https://") { api = a }
        payload = nil; sent = false; status = token == nil ? "" : "Готово до сканування"
    }

    // Код з QuoteCraft (6 цифр) → токен. Так додаток можна відкривати вручну, без посилання.
    func claim() {
        let code = pin.filter(\.isNumber)
        guard code.count == 6, !claiming else { status = "Введи 6 цифр коду з QuoteCraft."; return }
        claiming = true; status = "Перевіряю код…"
        var req = URLRequest(url: URL(string: api + "/api/scan-claim")!)
        req.httpMethod = "POST"; req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["pin": code])
        URLSession.shared.dataTask(with: req) { data, resp, err in
            DispatchQueue.main.async {
                self.claiming = false
                if let err { self.status = "Помилка: " + err.localizedDescription; return }
                let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
                if let t = json?["token"] as? String { self.token = t; self.sent = false; self.status = "✅ Код прийнято — можна сканувати"; if self.payload != nil { self.send() } }
                else { self.status = "Помилка: " + ((json?["error"] as? String) ?? "код не підійшов") }
            }
        }.resume()
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
