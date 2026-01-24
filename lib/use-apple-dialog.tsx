import { useCallback, useMemo, useState } from 'react';
import AppleDialog from '@/components/apple-dialog';

type AlertState = {
  kind: 'alert';
  title?: string;
  message: string;
  primaryLabel: string;
  resolve: () => void;
};

type ConfirmState = {
  kind: 'confirm';
  title?: string;
  message: string;
  primaryLabel: string;
  secondaryLabel: string;
  resolve: (value: boolean) => void;
};

type PromptState = {
  kind: 'prompt';
  title?: string;
  message: string;
  primaryLabel: string;
  secondaryLabel: string;
  placeholder?: string;
  defaultValue?: string;
  resolve: (value: string | null) => void;
};

type DialogState = AlertState | ConfirmState | PromptState;

type AlertOptions = {
  title?: string;
  primaryLabel?: string;
};

type ConfirmOptions = {
  title?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
};

type PromptOptions = {
  title?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  placeholder?: string;
  defaultValue?: string;
};

export default function useAppleDialog() {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [promptValue, setPromptValue] = useState('');

  const showAlert = useCallback((message: string, options?: AlertOptions) => {
    return new Promise<void>((resolve) => {
      setDialog({
        kind: 'alert',
        title: options?.title,
        message,
        primaryLabel: options?.primaryLabel ?? 'OK',
        resolve,
      });
    });
  }, []);

  const showConfirm = useCallback((message: string, options?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setDialog({
        kind: 'confirm',
        title: options?.title,
        message,
        primaryLabel: options?.primaryLabel ?? 'Confirm',
        secondaryLabel: options?.secondaryLabel ?? 'Cancel',
        resolve,
      });
    });
  }, []);

  const showPrompt = useCallback((message: string, options?: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setPromptValue(options?.defaultValue ?? '');
      setDialog({
        kind: 'prompt',
        title: options?.title,
        message,
        primaryLabel: options?.primaryLabel ?? 'OK',
        secondaryLabel: options?.secondaryLabel ?? 'Cancel',
        placeholder: options?.placeholder,
        defaultValue: options?.defaultValue,
        resolve,
      });
    });
  }, []);

  const dialogNode = useMemo(() => {
    if (!dialog) return null;

    const handlePrimary = () => {
      if (dialog.kind === 'alert') {
        dialog.resolve();
      } else if (dialog.kind === 'confirm') {
        dialog.resolve(true);
      } else {
        dialog.resolve(promptValue);
      }
      setDialog(null);
    };

    const handleSecondary = () => {
      if (dialog.kind === 'confirm') {
        dialog.resolve(false);
      } else if (dialog.kind === 'prompt') {
        dialog.resolve(null);
      }
      setDialog(null);
    };

    return (
      <AppleDialog
        open
        title={dialog.title}
        message={dialog.message}
        primaryLabel={dialog.primaryLabel}
        secondaryLabel={dialog.kind !== 'alert' ? dialog.secondaryLabel : undefined}
        onPrimary={handlePrimary}
        onSecondary={dialog.kind !== 'alert' ? handleSecondary : undefined}
        inputValue={dialog.kind === 'prompt' ? promptValue : undefined}
        inputPlaceholder={dialog.kind === 'prompt' ? dialog.placeholder : undefined}
        onInputChange={dialog.kind === 'prompt' ? setPromptValue : undefined}
      />
    );
  }, [dialog, promptValue]);

  return { dialog: dialogNode, showAlert, showConfirm, showPrompt };
}
