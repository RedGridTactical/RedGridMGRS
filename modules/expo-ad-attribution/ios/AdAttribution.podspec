Pod::Spec.new do |s|
  s.name           = 'AdAttribution'
  s.version        = '0.1.0'
  s.summary        = 'Apple Search Ads attribution token helper for Red Grid MGRS'
  s.description    = 'Wraps AAAttribution.attributionToken() (iOS 14.3+ AdServices.framework)'
  s.author         = ''
  s.homepage       = 'https://redgridtactical.com'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'AdServices'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
  }

  s.source_files = '**/*.{h,m,swift}'
end
