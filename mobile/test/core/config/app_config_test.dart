import 'package:flutter_test/flutter_test.dart';
import 'package:pharmalink_customer/core/config/app_config.dart';

void main() {
  test('uses the local development API when no build URL is supplied', () {
    expect(AppConfig.fromEnvironment().apiBaseUrl, 'http://localhost:3000');
  });
}
