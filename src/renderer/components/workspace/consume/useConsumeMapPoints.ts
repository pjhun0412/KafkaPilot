import { useEffect, useMemo, useRef } from "react";
import type { LiveMapPoint } from "../../../../shared/types";
import { createLiveMapPoint } from "../../../mapPreview";
import type { ConsumePanelProps } from "./consumePanelTypes";

export type ConsumeMapPointsProps = Pick<ConsumePanelProps, "mapFieldMapping" | "mode" | "messages" | "selectedMessage">;
export function useConsumeMapPoints(props: ConsumeMapPointsProps, selectedPayload: unknown) {
  const lastSentLiveMapMessageRef = useRef("");
  const lastSentSelectedMapMessageRef = useRef("");
  const pendingLiveMapPointsRef = useRef<LiveMapPoint[]>([]);
  const liveMapFlushTimerRef = useRef<number | null>(null);
  const mapFieldMappingKey = useMemo(() => JSON.stringify(props.mapFieldMapping ?? null), [props.mapFieldMapping]);

  useEffect(() => {
    if (props.mode !== "live" || props.messages.length === 0) return;
    const latestMessage = props.messages[0];
    const latestKey = `${latestMessage.topic}:${latestMessage.partition}:${latestMessage.offset}:${latestMessage.timestamp}:${mapFieldMappingKey}`;
    if (latestKey === lastSentLiveMapMessageRef.current) return;
    lastSentLiveMapMessageRef.current = latestKey;
    const point = createLiveMapPoint(latestMessage, undefined, undefined, props.mapFieldMapping);
    if (!point) return;
    pendingLiveMapPointsRef.current.push(point);
    if (liveMapFlushTimerRef.current !== null) return;
    liveMapFlushTimerRef.current = window.setTimeout(() => {
      liveMapFlushTimerRef.current = null;
      const points = pendingLiveMapPointsRef.current;
      pendingLiveMapPointsRef.current = [];
      if (points.length > 0) {
        void window.kafkaApi.sendLiveMapPoints(points);
      }
    }, 250);
  }, [mapFieldMappingKey, props.mapFieldMapping, props.messages, props.mode]);

  useEffect(() => {
    if (!props.selectedMessage) return;
    const selectedKey = `${props.selectedMessage.topic}:${props.selectedMessage.partition}:${props.selectedMessage.offset}:${props.selectedMessage.timestamp}:${mapFieldMappingKey}`;
    if (selectedKey === lastSentSelectedMapMessageRef.current) return;
    lastSentSelectedMapMessageRef.current = selectedKey;
    const point = createLiveMapPoint(props.selectedMessage, selectedPayload, undefined, props.mapFieldMapping) ?? createLiveMapPoint(props.selectedMessage);
    if (point) {
      void window.kafkaApi.sendLiveMapPoints([{ ...point, focus: true }]);
    }
  }, [mapFieldMappingKey, props.mapFieldMapping, props.selectedMessage, selectedPayload]);

  useEffect(() => {
    return () => {
      if (liveMapFlushTimerRef.current !== null) {
        window.clearTimeout(liveMapFlushTimerRef.current);
      }
    };
  }, []);
}
