import Foundation
import RoomPlan
import simd

// CapturedRoom → простий JSON для QuoteCraft (/lib/scanImport.ts). Метри, система ARKit (y вгору).
enum RoomJSON {
    static func build(_ room: CapturedRoom) -> [String: Any] {
        func surf(_ s: CapturedRoom.Surface) -> [String: Any] {
            var d = base(s.transform, s.dimensions)
            d["id"] = s.identifier.uuidString
            if let p = s.parentIdentifier { d["parent"] = p.uuidString }
            d["confidence"] = String(describing: s.confidence)
            return d
        }
        func obj(_ o: CapturedRoom.Object) -> [String: Any] {
            var d = base(o.transform, o.dimensions)
            d["id"] = o.identifier.uuidString
            d["category"] = String(describing: o.category)
            d["confidence"] = String(describing: o.confidence)
            return d
        }
        return [
            "app": "QuoteCraftScan/1.0",
            "walls": room.walls.map(surf),
            "doors": room.doors.map(surf),
            "windows": room.windows.map(surf),
            "openings": room.openings.map(surf),
            "objects": room.objects.map(obj),
        ]
    }
    // центр, поворот навколо вертикалі (yaw: кут локальної осі x у площині x/z), розміри
    static func base(_ t: simd_float4x4, _ dim: simd_float3) -> [String: Any] {
        let ax = t.columns.0 // локальна вісь x (ширина)
        let yaw = atan2(Double(ax.z), Double(ax.x))
        return ["cx": Double(t.columns.3.x), "cy": Double(t.columns.3.y), "cz": Double(t.columns.3.z),
                "yaw": yaw, "w": Double(dim.x), "h": Double(dim.y), "d": Double(dim.z)]
    }
}
