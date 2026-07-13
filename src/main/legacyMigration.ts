import { app, Notification } from "electron";
import { access, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { writeAppLog } from "./logger.js";
import { readPreferences, writePreferences } from "./storage.js";

const OLD_APP_NAME = "kafka-tool";

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// 구 Kafka Tool 설정을 KafkaPilot userData로 1회 마이그레이션
export async function runLegacyMigration() {
  const prefs = await readPreferences();
  if (prefs.migratedFromKafkaTool) return;

  const oldUserData = path.join(app.getPath("appData"), OLD_APP_NAME);
  const newUserData = app.getPath("userData");

  const oldServersPath = path.join(oldUserData, "servers.json");
  const oldPrefsPath   = path.join(oldUserData, "preferences.json");
  const newServersPath = path.join(newUserData, "servers.json");
  const newPrefsPath   = path.join(newUserData, "preferences.json");

  const hasOldServers = await fileExists(oldServersPath);
  const hasOldPrefs   = await fileExists(oldPrefsPath);

  if (!hasOldServers && !hasOldPrefs) {
    // 구 앱 데이터 없음 — 플래그만 저장 후 종료
    await writePreferences({ ...prefs, migratedFromKafkaTool: true });
    return;
  }

  await mkdir(newUserData, { recursive: true });

  // 새 위치에 파일이 없을 때만 복사 (기존 데이터 덮어쓰기 방지)
  let migrated = false;
  if (hasOldServers && !await fileExists(newServersPath)) {
    await copyFile(oldServersPath, newServersPath);
    migrated = true;
  }
  if (hasOldPrefs && !await fileExists(newPrefsPath)) {
    await copyFile(oldPrefsPath, newPrefsPath);
    migrated = true;
  }

  // 복사된 preferences를 다시 읽어 플래그 기록
  const migratedPrefs = await readPreferences();
  await writePreferences({ ...migratedPrefs, migratedFromKafkaTool: true });

  if (migrated) {
    void writeAppLog("info", "migration", "Migrated settings from Kafka Tool to KafkaPilot.");
    if (Notification.isSupported()) {
      new Notification({
        title: "KafkaPilot",
        body: "기존 Kafka Tool 설정을 가져왔습니다. 이전 Kafka Tool은 제어판 > 프로그램 추가/제거에서 제거할 수 있습니다."
      }).show();
    }
  }
}
