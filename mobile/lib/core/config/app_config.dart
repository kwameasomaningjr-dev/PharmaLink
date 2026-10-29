class AppConfig {
  const AppConfig({required this.apiBaseUrl});

  factory AppConfig.fromEnvironment() {
    const configuredUrl = String.fromEnvironment('API_BASE_URL');
    return AppConfig(
      apiBaseUrl: configuredUrl.isEmpty ? 'http://localhost:3000' : configuredUrl,
    );
  }

  final String apiBaseUrl;
}
