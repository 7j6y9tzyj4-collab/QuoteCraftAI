Pod::Spec.new do |s|
  s.name           = 'QcScan'
  s.version        = '1.0.0'
  s.summary        = 'LiDAR room scan (Apple RoomPlan) for QuoteCraft'
  s.description    = 'Scans a room with Apple RoomPlan and uploads the plan to QuoteCraft.'
  s.author         = 'K&V House Renovation'
  s.homepage       = 'https://quotecraftai-app.vercel.app'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.weak_frameworks = 'RoomPlan'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
