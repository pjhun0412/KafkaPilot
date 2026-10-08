import type { Dispatch, SetStateAction } from "react";
import type { PaneToastState, ToastState, WorkspaceActionTarget, WorkspacePaneId } from "../../uiTypes";
import { getConsumeTaskKey } from "../../workspaceState";
import { useRef } from "react";

type PaneToastScope = {
  serverId?: string;
  topic?: string;
};

type WorkspaceTaskParams = {
  setLoading: Dispatch<SetStateAction<boolean>>;
  setStatus: (status: string) => void;
  setToast: Dispatch<SetStateAction<ToastState>>;
  setPaneToast: Dispatch<SetStateAction<PaneToastState>>;
  setActiveConsumeTaskKeys: Dispatch<SetStateAction<string[]>>;
};

export function useWorkspaceTasks({
  setLoading,
  setStatus,
  setToast,
  setPaneToast,
  setActiveConsumeTaskKeys
}: WorkspaceTaskParams) {
  const workspaceTaskRunsRef = useRef(new Map<string, symbol>());
  async function runTask<T>(label: string, task: () => Promise<T>, options: { toast?: boolean } = {}) {
    const showToast = options.toast !== false;
    setLoading(true);
    setStatus(label);
    if (showToast) {
      setToast({ message: label, kind: "loading" });
    }
    try {
      const result = await task();
      setStatus("Done");
      if (showToast) {
        setToast({ message: "Done", kind: "success" });
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
      if (showToast) {
        setToast({ message, kind: "error" });
      }
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function runPaneTask<T>(pane: WorkspacePaneId, label: string, task: () => Promise<T>, scope: PaneToastScope = {}) {
    setLoading(true);
    setStatus(label);
    setToast(null);
    setPaneToast({ pane, message: label, kind: "loading", ...scope });
    try {
      const result = await task();
      setStatus("Done");
      setPaneToast({ pane, message: "Done", kind: "success", ...scope });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
      setPaneToast({ pane, message, kind: "error", ...scope });
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function runWorkspaceTask<T>(target: WorkspaceActionTarget, label: string, task: () => Promise<T>, options: { trackConsumeTask?: boolean } = {}) {
    const taskKey = target.topic && options.trackConsumeTask !== false ? getConsumeTaskKey(target.pane, target.serverId, target.topic) : null;
    const runId = Symbol();
    if (taskKey) {
      workspaceTaskRunsRef.current.set(taskKey, runId);
      setActiveConsumeTaskKeys((current) => current.includes(taskKey) ? current : [...current, taskKey]);
    }
    try {
      return await runPaneTask(target.pane, label, task, { serverId: target.serverId, topic: target.topic });
    } finally {
      if (taskKey && workspaceTaskRunsRef.current.get(taskKey) === runId) {
        workspaceTaskRunsRef.current.delete(taskKey);
        setActiveConsumeTaskKeys((current) => current.filter((key) => key !== taskKey));
      }
    }
  }

  function showPaneToast(pane: WorkspacePaneId, message: string, kind: "success" | "error" = "success", scope: PaneToastScope = {}) {
    setStatus(message);
    setToast(null);
    setPaneToast({ pane, message, kind, ...scope });
  }

  return {
    runTask,
    runPaneTask,
    runWorkspaceTask,
    showPaneToast
  };
}
