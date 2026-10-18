import SwiftUI
import RoomPlan

struct RootView: View {
    @EnvironmentObject var s: ScanSession
    @State private var scanning = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                if !RoomCaptureSession.isSupported {
                    Text("Цей iPhone не має LiDAR — сканування недоступне.").multilineTextAlignment(.center)
                } else if let p = s.payload {
                    Summary(p: p)
                    if s.sent {
                        Text("Відправлено ✅").font(.headline).foregroundStyle(.green)
                    } else if s.token != nil {
                        Button(s.sending ? "Відправляю…" : "📤 Відправити в QuoteCraft") { s.send() }
                            .buttonStyle(.borderedProminent).disabled(s.sending)
                    } else if s.paired {
                        Text("Скан готовий. У QuoteCraft натисни «📡 Сканувати LiDAR» у потрібній кімнаті, потім:").font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        Button(s.checking ? "…" : "🔄 Перевірити і відправити") { s.checkPending() }.buttonStyle(.borderedProminent).disabled(s.checking)
                    } else {
                        Text("Скан готовий. Введи код з QuoteCraft (один раз) — відправиться сам.").font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        CodeEntry()
                    }
                    Button("🔄 Сканувати ще раз") { s.payload = nil; s.sent = false; scanning = true }
                } else {
                    Image(systemName: "cube.transparent").font(.system(size: 64)).foregroundStyle(.blue)
                    Text("Сканування кімнати").font(.title2.bold())
                    Text("Повільно обійди кімнату, тримаючи телефон перед собою; наведи на кожну стіну, двері, вікна і сантехніку. Коли контур замкнеться — натисни «Готово».")
                        .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center).padding(.horizontal)
                    Button("▶︎ Почати сканування") { scanning = true }.buttonStyle(.borderedProminent).controlSize(.large)
                    if s.token != nil {
                        Text("🔗 Прив'язано до кімнати в QuoteCraft").font(.footnote).foregroundStyle(.green)
                    } else if s.paired {
                        Button(s.checking ? "…" : "🔄 Перевірити, чи QuoteCraft чекає скан") { s.checkPending() }.buttonStyle(.bordered).disabled(s.checking)
                    } else {
                        CodeEntry()
                    }
                }
                if !s.status.isEmpty { Text(s.status).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center) }
            }
            .padding()
            .navigationTitle("QuoteCraft Scan")
            .onAppear { if s.paired && s.token == nil { s.checkPending(quiet: true) } }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in if s.paired && s.token == nil && !s.sent { s.checkPending(quiet: true) } }
            .fullScreenCover(isPresented: $scanning) {
                ScanScreen { room in
                    s.payload = room.map(RoomJSON.build)
                    scanning = false
                    if s.payload != nil && s.token != nil { s.send() }
                    else if s.payload != nil && s.paired { s.checkPending(quiet: true) }
                }
            }
        }
    }
}

struct Summary: View {
    let p: [String: Any]
    var body: some View {
        let walls = (p["walls"] as? [[String: Any]]) ?? []
        let doors = (p["doors"] as? [[String: Any]]) ?? []
        let windows = (p["windows"] as? [[String: Any]]) ?? []
        let objects = (p["objects"] as? [[String: Any]]) ?? []
        VStack(alignment: .leading, spacing: 6) {
            Text("Результат скану").font(.headline)
            Text("Стін: \(walls.count) · Дверей: \(doors.count) · Вікон: \(windows.count)")
            Text("Об'єктів: \(objects.count)" + (objects.isEmpty ? "" : " — " + objects.compactMap { $0["category"] as? String }.joined(separator: ", ")))
            if let h = walls.compactMap({ $0["h"] as? Double }).max() { Text(String(format: "Висота стелі ≈ %.0f\"", h * 39.3701)) }
        }
        .padding().background(Color(.secondarySystemBackground)).cornerRadius(12)
    }
}

// Одноразова прив'язка: код з QuoteCraft («📡 Сканувати LiDAR» показує код у кімнаті огляду).
struct CodeEntry: View {
    @EnvironmentObject var s: ScanSession
    var body: some View {
        VStack(spacing: 8) {
            Text("Один раз: код з QuoteCraft, щоб прив'язати цей iPhone").font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            HStack {
                TextField("123 456", text: $s.pin).keyboardType(.numberPad).textFieldStyle(.roundedBorder)
                    .font(.title3.monospacedDigit()).frame(maxWidth: 160).multilineTextAlignment(.center)
                Button(s.claiming ? "…" : "Прив'язати") { s.claim() }.buttonStyle(.bordered).disabled(s.claiming)
            }
            Text("У QuoteCraft: кімната огляду → «📡 Сканувати LiDAR» → там буде код.").font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .padding(10).background(Color(.secondarySystemBackground)).cornerRadius(12)
    }
}
