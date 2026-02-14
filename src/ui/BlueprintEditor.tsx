import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react'
import { exportBlueprintSet, importBlueprintSet } from '@app/persistence'
import { BLUEPRINT_POLICY_OPTIONS, agentBlueprintSchema } from '@shared/blueprint'
import type { AgentBlueprint, BlueprintAgentKind, BlueprintSet, SimSnapshot } from '@shared/types'

interface BlueprintEditorProps {
  snapshot: SimSnapshot | null
  onApplyBlueprint: (kind: BlueprintAgentKind, blueprint: AgentBlueprint) => Promise<void>
}

type BlueprintErrors = Partial<Record<BlueprintAgentKind, string | null>>

export function BlueprintEditor({ snapshot, onApplyBlueprint }: BlueprintEditorProps) {
  const [drafts, setDrafts] = useState<BlueprintSet | null>(null)
  const [errors, setErrors] = useState<BlueprintErrors>({})
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    if (!snapshot) {
      return
    }

    setDrafts((current) => current ?? snapshot.blueprints)
  }, [snapshot])

  const isReady = snapshot !== null && drafts !== null

  const sections = useMemo(
    () =>
      [
        { kind: 'courierBot' as const, label: 'CourierBot' },
        { kind: 'minibus' as const, label: 'Minibus' },
      ] satisfies Array<{ kind: BlueprintAgentKind; label: string }>,
    [],
  )

  if (!isReady || !drafts) {
    return (
      <aside className="panel">
        <h2>Blueprints</h2>
        <p>Loading blueprints...</p>
      </aside>
    )
  }

  return (
    <aside className="panel">
      <h2>Blueprints</h2>

      {sections.map((section) => {
        const draft = drafts[section.kind]
        const error = errors[section.kind]

        return (
          <div key={section.kind} className="blueprint-section">
            <h3>{section.label}</h3>
            <label>
              Speed
              <input
                type="number"
                step="0.1"
                value={draft.speed}
                onChange={(event) =>
                  updateDraft(section.kind, 'speed', Number(event.target.value), setDrafts)
                }
              />
            </label>
            <label>
              Capacity
              <input
                type="number"
                step="1"
                value={draft.capacity}
                onChange={(event) =>
                  updateDraft(section.kind, 'capacity', Number(event.target.value), setDrafts)
                }
              />
            </label>
            <label>
              Wear Rate
              <input
                type="number"
                step="0.0001"
                value={draft.wearRate}
                onChange={(event) =>
                  updateDraft(section.kind, 'wearRate', Number(event.target.value), setDrafts)
                }
              />
            </label>
            <label>
              Maint. Threshold
              <input
                type="number"
                step="0.01"
                value={draft.maintenanceThreshold}
                onChange={(event) =>
                  updateDraft(
                    section.kind,
                    'maintenanceThreshold',
                    Number(event.target.value),
                    setDrafts,
                  )
                }
              />
            </label>

            <p>Policies</p>
            <div className="policy-list">
              {BLUEPRINT_POLICY_OPTIONS[section.kind].map((policyId) => {
                const checked = draft.policyIds.includes(policyId)

                return (
                  <label key={policyId} className="policy-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        togglePolicy(section.kind, policyId, checked, setDrafts)
                      }
                    />
                    <span>{policyId}</span>
                  </label>
                )
              })}
            </div>

            {error ? <p className="error-text">{error}</p> : null}

            <button
              type="button"
              onClick={async () => {
                const parsed = agentBlueprintSchema.safeParse(draft)
                if (!parsed.success) {
                  setErrors((current) => ({
                    ...current,
                    [section.kind]: parsed.error.issues[0]?.message ?? 'Invalid blueprint',
                  }))
                  return
                }

                setErrors((current) => ({ ...current, [section.kind]: null }))
                await onApplyBlueprint(section.kind, parsed.data)
              }}
            >
              Apply {section.label}
            </button>
          </div>
        )
      })}

      <div className="blueprint-section">
        <h3>Export / Import</h3>
        <button
          type="button"
          onClick={async () => {
            const payload = exportBlueprintSet(drafts)
            await navigator.clipboard.writeText(payload)
          }}
        >
          Copy Blueprint JSON
        </button>
        <label>
          Import JSON
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            rows={5}
          />
        </label>
        {importError ? <p className="error-text">{importError}</p> : null}
        <button
          type="button"
          onClick={async () => {
            try {
              const imported = importBlueprintSet(importText)
              setDrafts(imported)
              await onApplyBlueprint('courierBot', imported.courierBot)
              await onApplyBlueprint('minibus', imported.minibus)
              setImportError(null)
            } catch (error) {
              setImportError(error instanceof Error ? error.message : 'Invalid blueprint JSON')
            }
          }}
        >
          Import and Apply
        </button>
      </div>
    </aside>
  )
}

function updateDraft(
  kind: BlueprintAgentKind,
  field: keyof AgentBlueprint,
  value: number,
  setDrafts: Dispatch<SetStateAction<BlueprintSet | null>>,
): void {
  setDrafts((current) => {
    if (!current) {
      return current
    }

    return {
      ...current,
      [kind]: {
        ...current[kind],
        [field]: value,
      },
    }
  })
}

function togglePolicy(
  kind: BlueprintAgentKind,
  policyId: string,
  checked: boolean,
  setDrafts: Dispatch<SetStateAction<BlueprintSet | null>>,
): void {
  setDrafts((current) => {
    if (!current) {
      return current
    }

    const nextPolicyIds = checked
      ? current[kind].policyIds.filter((existing) => existing !== policyId)
      : [...current[kind].policyIds, policyId]

    return {
      ...current,
      [kind]: {
        ...current[kind],
        policyIds: nextPolicyIds,
      },
    }
  })
}
