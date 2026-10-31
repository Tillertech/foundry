/**
 * The stable surface for API extensions (see EXTENDING.md). Anything exported
 * here keeps its contract across minor releases; a breaking change is called
 * out in the release notes. Import from this file rather than deep paths.
 */

// Booting your own root module (AppModule + your modules).
export { AppModule } from './app/app.module';
export { bootstrapFoundry } from './bootstrap';

// Auth: protect your routes exactly like the built-in ones.
export { JwtAuthGuard, type JwtPayload } from './identity/auth/jwt-auth.guard';
export { CurrentUser } from './identity/auth/decorators/current-user.decorator';

// Data access.
export { PrismaModule } from './prisma/prisma.module';
export { PrismaService } from './prisma/prisma.service';

// Workspaces and the optional x-workspace-id request scope.
export { WorkspacesModule } from './workspaces/workspaces.module';
export { WorkspacesService } from './workspaces/workspaces.service';
export {
  WORKSPACE_HEADER,
  WorkspaceScope,
} from './common/workspace-scope/workspace-scope';

// Document rendering and the theme hook.
export { InvoicesModule } from './invoices/invoices.module';
export {
  PDF_THEME_RESOLVER,
  PdfGeneratorService,
  type InvoicePdfData,
  type PdfDocumentKind,
  type PdfTheme,
  type PdfThemeResolver,
  type QuotePdfData,
  type ReceiptPdfData,
} from './invoices/pdf-generator.service';
