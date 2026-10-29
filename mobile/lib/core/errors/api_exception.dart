class ApiException implements Exception {
  const ApiException({
    required this.message,
    this.code,
    this.statusCode,
    this.requestId,
  });

  final String message;
  final String? code;
  final int? statusCode;
  final String? requestId;

  @override
  String toString() => 'ApiException(${code ?? 'UNKNOWN'}): $message';
}
