import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../errors/api_exception.dart';
import '../storage/secure_token_storage.dart';

class ApiClient {
  ApiClient({
    required AppConfig config,
    required SecureTokenStorage tokenStorage,
  })  : _tokenStorage = tokenStorage,
        dio = Dio(
          BaseOptions(
            baseUrl: '${config.apiBaseUrl}/v1',
            connectTimeout: const Duration(seconds: 15),
            receiveTimeout: const Duration(seconds: 20),
            sendTimeout: const Duration(seconds: 20),
            headers: const {'Accept': 'application/json'},
          ),
        ) {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _tokenStorage.readAccessToken();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) {
          handler.next(error);
        },
      ),
    );
  }

  final Dio dio;
  final SecureTokenStorage _tokenStorage;

  Future<Response<dynamic>> get(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    try {
      return await dio.get(path, queryParameters: queryParameters);
    } on DioException catch (error) {
      throw _toApiException(error);
    }
  }

  Future<Response<dynamic>> post(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
    Map<String, dynamic>? headers,
  }) async {
    try {
      return await dio.post(
        path,
        data: data,
        queryParameters: queryParameters,
        options: headers == null ? null : Options(headers: headers),
      );
    } on DioException catch (error) {
      throw _toApiException(error);
    }
  }

  ApiException _toApiException(DioException error) {
    final responseData = error.response?.data;
    final errorData = responseData is Map<String, dynamic>
        ? responseData['error']
        : null;
    final errorMap = errorData is Map<String, dynamic> ? errorData : null;

    return ApiException(
      message: errorMap?['message'] as String? ??
          'The request could not be completed. Check your connection and try again.',
      code: errorMap?['code'] as String?,
      requestId: errorMap?['request_id'] as String?,
      statusCode: error.response?.statusCode,
    );
  }
}
