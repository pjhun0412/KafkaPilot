import type { AppLanguage } from "./i18n";

type ReleaseNoteSection = {
  heading?: string;
  items: string[];
};

export type ReleaseNote = {
  title: string;
  sections: ReleaseNoteSection[];
};

export const releaseNotes: Record<string, Record<AppLanguage, ReleaseNote>> = {
  "2.0.6": {
    ko: {
      title: "KafkaPilot 2.0.6",
      sections: [
        {
          heading: "Consume Value Columns",
          items: [
            "Consume 결과에서 Value 내부 key를 선택해 그리드 컬럼으로 바로 표시할 수 있습니다.",
            "선택한 Value Columns는 토픽별 Viewer 설정으로 저장되어 다시 열어도 유지됩니다.",
            "Message Viewer의 Tree에서 leaf 값을 바로 Value Columns에 추가할 수 있습니다.",
            "CSV로 내보낼 때 선택한 Value Columns가 기본 컬럼 뒤에 함께 포함됩니다."
          ]
        },
        {
          heading: "Map Viewer",
          items: [
            "토픽별 Map Field Mapping으로 JSON 내부 좌표 path를 직접 지정할 수 있습니다.",
            "WGS84, WGS84 millisecond, Korea TM, UTM Zone 52N 좌표계를 지원합니다.",
            "차량 마커, heading, trail, 선택 차량 follow 모드를 지원합니다.",
            "km/h와 m/s 속도 필드를 Map Viewer에서 함께 표시할 수 있습니다.",
            "차량 이동과 heading 갱신이 더 자연스럽게 보이도록 보간 처리를 개선했습니다."
          ]
        },
        {
          heading: "Consumer Group Offset Reset",
          items: [
            "Consumer Group 상세 화면에서 Partition별 offset을 Earliest, Latest, Timestamp, Specific offset으로 리셋할 수 있습니다.",
            "실행 전 미리보기와 RESET 확인 입력을 요구해 운영 실수를 줄입니다.",
            "활성 Consumer Group은 자동으로 차단하고, reset 진행 상태와 오류를 팝업 내부에서 확인할 수 있습니다."
          ]
        },
        {
          heading: "Message Replay",
          items: [
            "Consume한 메시지를 원하는 대상 서버와 Topic으로 바로 다시 전송할 수 있습니다.",
            "단건, 선택 메시지, 필터 결과, 조회된 전체 메시지를 Replay 대상으로 선택할 수 있습니다.",
            "Replay 팝업에서 원본 Cluster/Topic/Partition/Offset과 대상 서버/Topic을 확인하고 Key, Headers, Value 포함 여부를 선택할 수 있습니다.",
            "전송 순서를 Grid order, Original order, Timestamp order 중 선택할 수 있습니다.",
            "단건은 Payload를 직접 수정할 수 있고, 다건 Replay는 Value 필드별 Dynamic Field 치환을 지원합니다.",
            "대량 Replay는 메시지 간 Delay를 설정할 수 있으며, 백그라운드 Replay Jobs 패널에서 진행률 확인과 전송 중단이 가능합니다."
          ]
        },
        {
          heading: "성능 및 안정성",
          items: [
            "대량 Consume 탭 전환 때 불필요한 필터 복사와 메시지 row 재계산을 줄였습니다.",
            "토픽 전환 시 Value Columns 선택 팝업이 다른 토픽에 남아 보이던 문제를 수정했습니다."
          ]
        }
      ]
    },
    en: {
      title: "KafkaPilot 2.0.6",
      sections: [
        {
          heading: "Consume Value Columns",
          items: [
            "Pick keys inside message Value and show them as dedicated columns in the Consume grid.",
            "Selected Value Columns are saved per topic through Viewer preferences.",
            "Leaf values in the Message Viewer Tree can now be added directly to Value Columns.",
            "CSV exports now include selected Value Columns after the default columns."
          ]
        },
        {
          heading: "Map Viewer",
          items: [
            "Per-topic Map Field Mapping lets you choose coordinate paths inside nested JSON values.",
            "WGS84, WGS84 millisecond, Korea TM, and UTM Zone 52N coordinate systems are supported.",
            "Vehicle markers now support heading, trails, and selected-vehicle follow mode.",
            "Speed fields in km/h or m/s can be shown in Map Viewer.",
            "Vehicle position and heading updates are interpolated for smoother movement."
          ]
        },
        {
          heading: "Consumer Group Offset Reset",
          items: [
            "Reset selected Consumer Group partitions to Earliest, Latest, Timestamp, or a Specific offset from the detail view.",
            "Preview and explicit RESET confirmation are required before applying changes.",
            "Active consumer groups are blocked, and progress/errors are shown directly inside the reset dialog."
          ]
        },
        {
          heading: "Message Replay",
          items: [
            "Replay consumed messages directly to any target server and Topic.",
            "Choose a single message, selected messages, filtered results, or all loaded messages as the Replay source.",
            "The replay dialog shows source cluster/topic/partition/offset details and target server/topic details, with Key, Headers, and Value include toggles.",
            "Batch Replay can be sent in Grid, Original, or Timestamp order.",
            "Single Replay supports direct payload editing, while batch Replay supports Dynamic Field overrides for selected Value fields.",
            "Large Replay jobs support per-message Delay and continue in the background with progress and abort controls in the Replay Jobs panel."
          ]
        },
        {
          heading: "Performance and stability",
          items: [
            "Reduced unnecessary filter copies and message row recalculation when switching large Consume tabs.",
            "Fixed the Value Columns picker remaining open after switching topics."
          ]
        }
      ]
    }
  },
  "2.0.4": {
    ko: {
      title: "KafkaPilot 2.0.4",
      sections: [
        {
          heading: "서버 연결 테스트",
          items: [
            "서버 추가/수정 팝업에 Test 버튼을 추가해 저장 전에 Kafka 연결을 미리 확인할 수 있습니다.",
            "필수값 누락 검증과 연결 실패 원인을 팝업 내부에서 바로 확인할 수 있습니다."
          ]
        },
        {
          heading: "UI 버그 수정",
          items: [
            "서버/토픽 우클릭 메뉴가 다크 테마 색상과 자연스럽게 표시되도록 수정했습니다.",
            "연결 실패 서버 아이콘 중앙에 불필요한 x 문자가 겹쳐 보이던 문제를 해결했습니다."
          ]
        }
      ]
    },
    en: {
      title: "KafkaPilot 2.0.4",
      sections: [
        {
          heading: "Server connection test",
          items: [
            "Added a Test button in the server profile dialog to verify Kafka connectivity before saving.",
            "Required-field validation and detailed connection errors are now shown directly inside the dialog."
          ]
        },
        {
          heading: "UI fixes",
          items: [
            "Fixed server/topic context menus to properly match dark theme colors.",
            "Fixed failed server connection indicators showing an extra overlapping x character."
          ]
        }
      ]
    }
  },
  "2.0.3": {
    ko: {
      title: "KafkaPilot 2.0.3",
      sections: [
        {
          heading: "스마트 자동 발행 (Interval Produce)",
          items: [
            "정해진 주기(Every)마다 메시지를 연속으로 자동 발행할 수 있습니다.",
            "설정한 횟수(Count) 또는 시간(Duration)에 도달하면 발행이 안전하게 자동 종료됩니다.",
            "유효하지 않은 문법이나 종료 조건은 시작 전에 미리 검증해 실수를 방지합니다."
          ]
        },
        {
          heading: "동적 치환 템플릿 엔진",
          items: [
            "Key, Headers, Value에 ${seq}, ${random}, ${date}, ${uuid} 등의 문법으로 매번 다른 테스트 데이터를 발행할 수 있습니다.",
            "Preview 버튼으로 실제 치환된 발행 결과를 미리 확인할 수 있습니다.",
            "자주 쓰는 메시지 규격을 토픽별로 저장하고 불러와 관리할 수 있습니다."
          ]
        },
        {
          heading: "단축키 및 작업 효율 개선",
          items: [
            "Ctrl/Cmd+Right / Left 단축키로 토픽 탭을 좌우 분할 화면 사이에 빠르게 이동할 수 있습니다.",
            "Ctrl/Cmd+W 단축키로 현재 활성 Pane의 토픽 탭을 즉시 닫을 수 있습니다."
          ]
        }
      ]
    },
    en: {
      title: "KafkaPilot 2.0.3",
      sections: [
        {
          heading: "Smart automatic publishing (Interval Produce)",
          items: [
            "Messages can be published repeatedly at a fixed Every interval.",
            "Publishing stops safely when the selected Count or Duration limit is reached.",
            "Invalid syntax and stop conditions are validated upfront to prevent accidental heavy loads."
          ]
        },
        {
          heading: "Dynamic replacement template engine",
          items: [
            "Key, Headers, and Value support ${seq}, ${random}, ${date}, ${uuid}, and more to generate unique test data per message.",
            "Use the Preview button to inspect the fully rendered payload before publishing.",
            "Frequently used message shapes can be saved, loaded, and managed per topic."
          ]
        },
        {
          heading: "Shortcut and workflow improvements",
          items: [
            "Press Ctrl/Cmd+Right / Left to move Topic tabs between left and right split panes.",
            "Press Ctrl/Cmd+W to close the current Topic tab in the active pane."
          ]
        }
      ]
    }
  },
  "2.0.2": {
    ko: {
      title: "KafkaPilot 2.0.2",
      sections: [
        {
          items: [
            "환경설정(Preferences)에서 앱 내부 단축키를 직접 편집할 수 있습니다.",
            "macOS(Cmd)와 Windows/Linux(Ctrl)에 맞게 단축키가 자연스럽게 동작합니다.",
            "업데이트 직후 주요 변경 사항을 보여주는 Release Notes 팝업을 추가했습니다. Help 메뉴에서 언제든 다시 열 수 있습니다."
          ]
        }
      ]
    },
    en: {
      title: "KafkaPilot 2.0.2",
      sections: [
        {
          items: [
            "Keyboard shortcuts used inside the app can now be fully customized in Preferences.",
            "Shortcut handling now maps naturally to Cmd on macOS and Ctrl on Windows/Linux.",
            "Introduced this Release Notes view to show key changes right after an app update. Reopen anytime via the Help menu."
          ]
        }
      ]
    }
  },
  "2.0.1": {
    ko: {
      title: "KafkaPilot 2.0.1",
      sections: [
        {
          items: [
            "Message Viewer에 Raw, Tree, Preview 모드를 도입하고 마지막으로 선택한 뷰 모드를 기억합니다.",
            "Key와 Value를 Text, JSON, Hex, Base64 형식으로 조회하고 Export할 수 있습니다.",
            "Live Record는 렌더러 메모리를 거치지 않고 파일 스트림에 직접 기록해 장시간 수집 중 메모리 누적을 방지합니다."
          ]
        }
      ]
    },
    en: {
      title: "KafkaPilot 2.0.1",
      sections: [
        {
          items: [
            "Message Viewer now separates Raw, Tree, and Preview tabs and remembers your last selected view mode.",
            "Key/Value can be inspected as Text, JSON, Hex, or Base64, and exports preserve your selected representation.",
            "Live Record now writes directly through a file stream, preventing renderer memory growth during long captures."
          ]
        }
      ]
    }
  },
  "2.0.0": {
    ko: {
      title: "KafkaPilot 2.0.0",
      sections: [
        {
          items: [
            "앱 안에서 Topic 생성, Settings 편집, Clear Messages를 실행할 수 있습니다.",
            "Broker 상세 화면에서 Configs, Metrics, Log directory 정보를 확인할 수 있습니다.",
            "Consumer Group 상세 화면을 토픽별 접기/펼치기 형태로 개선했습니다.",
            "한국어/영어 UI와 Inter + Noto Sans KR 폰트를 공식 지원합니다.",
            "대량 Consume 조회 속도와 Split Pane 반응 속도를 크게 개선했습니다."
          ]
        }
      ]
    },
    en: {
      title: "KafkaPilot 2.0.0",
      sections: [
        {
          items: [
            "Added Topic creation, Settings editing, and Clear Messages directly inside the app.",
            "Added Broker detail views with Configs, live Metrics, and Log directory information.",
            "Redesigned Consumer Group details with collapsible per-topic sections.",
            "Added full Korean/English UI support with Inter and Noto Sans KR fonts.",
            "Greatly improved performance for large Consume queries and split pane interactions."
          ]
        }
      ]
    }
  }
};

export function getReleaseNote(version: string, language: AppLanguage) {
  return releaseNotes[version]?.[language] ?? releaseNotes[version]?.en;
}
