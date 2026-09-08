import type { Dispatch, SetStateAction } from "react";
import type { ManualAvroSchema, ProduceTemplatePreference } from "../../../../shared/types";
import type { ProduceDraftOverride } from "../../../hooks/actions/useProduceActions";
import {
  type ProduceIntervalRequest
} from "../../../produceTemplate";

export type ProduceIntervalConfig = ProduceTemplatePreference["intervalConfig"];

export type ProducePanelProps = {
  topic: string;
  keyText: string;
  headers: string;
  value: string;
  templates: ProduceTemplatePreference[];
  hasAvroSchema: boolean;
  avroEncoding?: ManualAvroSchema["encoding"];
  onKey: (value: string) => void;
  onHeaders: (value: string) => void;
  onValue: (value: string) => void;
  onTemplates: (templates: ProduceTemplatePreference[]) => void;
  onProduce: () => void;
  onProduceDraft: (draft: ProduceDraftOverride) => Promise<void>;
  intervalConfig: ProduceIntervalConfig;
  intervalState: {
    error: string;
    isRunning: boolean;
    sentCount: number;
    startedAt: number;
  };
  onIntervalConfig: Dispatch<SetStateAction<ProduceIntervalConfig>>;
  onStartInterval: (request: ProduceIntervalRequest) => Promise<void>;
  onStopInterval: () => void;
};
