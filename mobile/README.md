# PharmaLink Customer Mobile App

Flutter customer client for PharmaLink. The app consumes the existing `/v1` API;
inventory, pricing, prescription review, payments, and order transitions remain
server-authoritative.

## Local setup

Install Flutter 3.19 or newer, then run:

```shell
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

For a physical device or a different environment, provide the appropriate API URL:

```shell
flutter run --dart-define=API_BASE_URL=https://api.example.com
```

The API base URL must not be hard-coded into production builds.

## Current foundation

- Environment-aware API configuration.
- Dio client with bearer-token injection and safe error normalization.
- Secure token storage abstraction.
- Riverpod providers for core dependencies.
- GoRouter shell with public and authenticated route boundaries.
- Ghana-first Material theme.

The Flutter SDK is required to generate platform folders and run tests. Android is
the first validation target; iOS configuration should be generated from the same
project before release validation.
