'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChecklistTool } from '@/components/module/checklist-tool';
import type { ModuleContent } from '@/lib/engine/module-content';
import { saveChecklist } from '@/lib/learning/actions';
import type { LearningResult } from '@/lib/learning/errors';
import type { ChecklistState } from '@/lib/learning/schemas';

export type ToolsListProps = {
  moduleId: string;
  tools: ModuleContent['application']['tools'];
  checklist: ChecklistState;
};

/** E4-02 AC5: checklists persist optimistically and roll back on a failed save. */
export function ToolsList({ moduleId, tools, checklist: initialChecklist }: ToolsListProps) {
  const t = useTranslations('reader.module.apply');
  const [checklist, setChecklist] = useState<ChecklistState>(initialChecklist);
  const [saveFailed, setSaveFailed] = useState(false);

  function toggle(toolIndex: number, itemIndex: number) {
    const key = String(toolIndex);
    const previous = checklist;
    const current = previous[key] ?? [];
    const next = current.includes(itemIndex)
      ? current.filter((index) => index !== itemIndex)
      : [...current, itemIndex].sort((a, b) => a - b);

    setChecklist({ ...previous, [key]: next });
    setSaveFailed(false);

    void (async () => {
      try {
        const result = (await saveChecklist({
          moduleId,
          toolIndex,
          checkedIndices: next,
        })) as unknown as LearningResult<{ checklist: Record<string, number[]> }>;
        if (!result.ok) {
          setChecklist(previous);
          setSaveFailed(true);
        }
      } catch {
        setChecklist(previous);
        setSaveFailed(true);
      }
    })();
  }

  return (
    <div className="flex flex-col gap-4">
      {saveFailed ? (
        <p role="alert" className="text-danger text-small">
          {t('checklistSaveError')}
        </p>
      ) : null}

      {tools.map((tool, toolIndex) =>
        tool.type === 'checklist' ? (
          <ChecklistTool
            key={`${toolIndex}-${tool.name}`}
            title={tool.name}
            items={tool.items}
            checked={checklist[String(toolIndex)] ?? []}
            onToggle={(itemIndex) => toggle(toolIndex, itemIndex)}
          />
        ) : (
          <section
            key={`${toolIndex}-${tool.name}`}
            aria-label={tool.name}
            className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-5"
          >
            <h3 className="text-h3 break-words">{tool.name}</h3>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {tool.items.map((item, itemIndex) => (
                <li key={`${itemIndex}-${item}`} className="text-reading">
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
