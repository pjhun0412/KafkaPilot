import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { ExportSettingsOptions, ImportSettingsOptions } from "../../../shared/types";
import type { AppLanguage } from "../../i18n";

type SettingsTransferDialogProps = {
  kind: "export" | "import";
  language: AppLanguage;
  onClose: () => void;
  onSubmitExport: (options: ExportSettingsOptions) => void;
  onSubmitImport: (options: ImportSettingsOptions) => void;
};

function text(language: AppLanguage) {
  if (language === "ko") {
    return {
      exportTitle: "설정 내보내기",
      exportDescription: "서버 목록과 환경설정을 JSON 파일로 저장합니다.",
      includeSecrets: "민감정보 포함",
      includeSecretsHelp: "client secret, password, token을 비밀번호로 암호화해서 함께 내보냅니다.",
      excludeSecretsHelp: "민감정보는 제외하고 내보냅니다. 가져온 뒤 secret 값은 다시 입력해야 합니다.",
      password: "비밀번호",
      confirmPassword: "비밀번호 확인",
      passwordPlaceholder: "내보내기 파일 암호",
      confirmPlaceholder: "한 번 더 입력",
      passwordRequired: "민감정보를 포함하려면 비밀번호가 필요합니다.",
      passwordMismatch: "비밀번호가 서로 다릅니다.",
      export: "내보내기",
      importTitle: "설정 가져오기",
      importDescription: "일반 설정 파일은 비워두고, 민감정보 포함 파일이면 내보내기 비밀번호를 입력하세요.",
      importPasswordPlaceholder: "암호화 파일 비밀번호",
      import: "가져오기",
      cancel: "취소",
      close: "닫기"
    };
  }
  return {
    exportTitle: "Export Settings",
    exportDescription: "Save servers and preferences to a JSON file.",
    includeSecrets: "Include secrets",
    includeSecretsHelp: "Encrypt client secrets, passwords, and tokens with a password.",
    excludeSecretsHelp: "Secrets are excluded. Re-enter secret values after import.",
    password: "Password",
    confirmPassword: "Confirm password",
    passwordPlaceholder: "Export file password",
    confirmPlaceholder: "Enter it again",
    passwordRequired: "Enter a password to include secrets.",
    passwordMismatch: "Passwords do not match.",
    export: "Export",
    importTitle: "Import Settings",
    importDescription: "Leave blank for normal settings files. Enter the export password for encrypted files.",
    importPasswordPlaceholder: "Encrypted file password",
    import: "Import",
    cancel: "Cancel",
    close: "Close"
  };
}

export function SettingsTransferDialog({
  kind,
  language,
  onClose,
  onSubmitExport,
  onSubmitImport
}: SettingsTransferDialogProps) {
  const labels = text(language);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setIncludeSecrets(false);
    setPassword("");
    setConfirmPassword("");
    setError("");
  }, [kind]);

  function submitExport() {
    if (!includeSecrets) {
      onSubmitExport({});
      return;
    }
    if (!password) {
      setError(labels.passwordRequired);
      return;
    }
    if (password !== confirmPassword) {
      setError(labels.passwordMismatch);
      return;
    }
    onSubmitExport({ includeSecrets: true, password });
  }

  function submitImport() {
    onSubmitImport(password ? { password } : {});
  }

  const title = kind === "export" ? labels.exportTitle : labels.importTitle;
  const description = kind === "export" ? labels.exportDescription : labels.importDescription;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="server-modal settings-transfer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-transfer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-title">
          <div>
            <span className="eyebrow">KafkaPilot</span>
            <h2 id="settings-transfer-title">{title}</h2>
          </div>
          <button className="modal-close" onClick={onClose} title={labels.close}>
            <X size={16} />
          </button>
        </div>
        <p className="settings-transfer-description">{description}</p>
        {kind === "export" ? (
          <div className="settings-transfer-body">
            <label className="checkbox-row settings-transfer-checkbox">
              <input
                type="checkbox"
                checked={includeSecrets}
                onChange={(event) => {
                  setIncludeSecrets(event.target.checked);
                  setError("");
                }}
              />
              <span>{labels.includeSecrets}</span>
            </label>
            <p className="settings-transfer-help">
              {includeSecrets ? labels.includeSecretsHelp : labels.excludeSecretsHelp}
            </p>
            {includeSecrets && (
              <div className="settings-transfer-passwords">
                <label>
                  {labels.password}
                  <input
                    autoFocus
                    type="password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError("");
                    }}
                    placeholder={labels.passwordPlaceholder}
                  />
                </label>
                <label>
                  {labels.confirmPassword}
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      setError("");
                    }}
                    placeholder={labels.confirmPlaceholder}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") submitExport();
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        ) : (
          <div className="settings-transfer-body">
            <label>
              {labels.password}
              <input
                autoFocus
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={labels.importPasswordPlaceholder}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitImport();
                }}
              />
            </label>
          </div>
        )}
        {error && <div className="settings-transfer-error">{error}</div>}
        <div className="modal-actions">
          <button className="ghost" type="button" onClick={onClose}>
            {labels.cancel}
          </button>
          <button className="primary" type="button" onClick={kind === "export" ? submitExport : submitImport}>
            {kind === "export" ? labels.export : labels.import}
          </button>
        </div>
      </section>
    </div>
  );
}
