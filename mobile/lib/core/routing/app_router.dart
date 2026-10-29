import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

final appRouter = GoRouter(
  initialLocation: '/search',
  routes: [
    GoRoute(
      path: '/login',
      builder: (context, state) => const _PlaceholderPage(
        title: 'Sign in',
        message: 'Customer authentication is the next implementation slice.',
      ),
    ),
    GoRoute(
      path: '/search',
      builder: (context, state) => const _PlaceholderPage(
        title: 'Find medicine',
        message: 'Search and pharmacy discovery are coming next.',
      ),
    ),
  ],
);

class _PlaceholderPage extends StatelessWidget {
  const _PlaceholderPage({required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(message, textAlign: TextAlign.center),
        ),
      ),
    );
  }
}
