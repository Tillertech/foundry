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

// Lifecycle events: what an owner account holds changed (common/events).
// Emitted after the write commits; nothing in Foundry listens. Payloads carry
// ids only - see OwnedRecordEvent.
export {
  ClientEvents,
  WorkspaceEvents,
  type OwnedRecordEvent,
  type ProjectMovedEvent,
} from './common/events/workspace.events';
export { ProjectEvents } from './common/events/project.events';
export { DocumentEvents } from './common/events/document.events';
export { AuthEvents } from './common/events/auth.events';

// Account export (data-transfer/bundle.ts): the bundle format, the registry
// that says which tables an account owns, and a streaming reader, so a
// separate tool can read what Foundry writes.
export { DataTransferModule } from './data-transfer/data-transfer.module';
export { AccountExportService } from './data-transfer/account-export.service';
export {
  ACCOUNT_TABLES,
  EXPORT_ORDER,
  delegateName,
  isExported,
  type ExportedTable,
  type TableRule,
} from './data-transfer/account-registry';
export {
  BUNDLE_EXTENSION,
  BUNDLE_FORMAT,
  BundleError,
  readBundle,
  type BundleEnd,
  type BundleFileChunk,
  type BundleLine,
  type BundleManifest,
  type BundleRow,
} from './data-transfer/bundle';

// Stored files: the configured driver (local disk or S3).
export { StorageService } from './storage/storage.service';
