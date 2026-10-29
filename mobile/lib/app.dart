import 'package:flutter/material.dart';

import 'core/routing/app_router.dart';
import 'core/theme/app_theme.dart';

class PharmaLinkApp extends StatelessWidget {
  const PharmaLinkApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'PharmaLink',
      theme: AppTheme.light,
      routerConfig: appRouter,
    );
  }
}
