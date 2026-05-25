import * as vscode from 'vscode';
import { ASCViewProvider } from './ascViewProvider';

export function activate(context: vscode.ExtensionContext) {
  // Register the ASC custom editor provider
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      ASCViewProvider.viewType,
      new ASCViewProvider(context),
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  // Register an explicit "Open with ASC Viewer" command
  context.subscriptions.push(
    vscode.commands.registerCommand('asc.openFile', async (uri?: vscode.Uri) => {
      if (!uri) {
        const picked = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { 'ASC Files': ['asc'] },
          openLabel: 'Open ASC File',
        });
        if (!picked || picked.length === 0) return;
        uri = picked[0];
      }
      await vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        ASCViewProvider.viewType
      );
    })
  );

  console.log('ASC Viewer extension activated');
}

export function deactivate() {}
