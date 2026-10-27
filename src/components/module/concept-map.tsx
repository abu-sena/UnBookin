'use client';

import { Graph, layout } from '@dagrejs/dagre';
import { MinusIcon, PlusIcon, RotateCcwIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ModuleContent } from '@/lib/engine/module-content';

export type ConceptNode = ModuleContent['conceptMap']['nodes'][number];
export type ConceptEdge = ModuleContent['conceptMap']['edges'][number];

export type ConceptMapProps = {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  onNodeSelect?: (id: string) => void;
  title?: string;
  className?: string;
};

type Transform = { x: number; y: number; scale: number };

type LaidOutNode = ConceptNode & { x: number; y: number; width: number; height: number };
type LaidOutEdge = ConceptEdge & { points: { x: number; y: number }[]; labelX?: number; labelY?: number };

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const NODE_HEIGHT = 44;

function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function nodeWidth(label: string) {
  return Math.min(180, Math.max(96, label.length * 7 + 28));
}

function truncate(label: string, width: number) {
  const max = Math.max(6, Math.floor((width - 20) / 7));
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

const nodeStyles: Record<ConceptNode['kind'], { fill: string; stroke: string; text: string }> = {
  core: { fill: 'var(--primary-soft)', stroke: 'var(--primary)', text: 'var(--text)' },
  concept: { fill: 'var(--surface-2)', stroke: 'var(--border)', text: 'var(--text)' },
  example: { fill: 'var(--surface)', stroke: 'var(--level-advanced-beginner)', text: 'var(--text)' },
};

/**
 * Interactive concept map (PRD §12.7, E4-02 AC3). Dagre computes a
 * top-to-bottom layout; the SVG is scaled to the container width so it never
 * causes horizontal overflow. Drag pans, two-finger pinch and wheel zoom, and
 * the buttons provide the same zoom controls for keyboard users.
 */
export function ConceptMap({ nodes, edges, onNodeSelect, title, className }: ConceptMapProps) {
  const t = useTranslations('module.conceptMap');
  const containerRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const graph = useMemo(() => {
    const uniqueNodes = Array.from(new Map(nodes.map((node) => [node.id, node])).values());
    if (uniqueNodes.length === 0) return { width: 0, height: 0, nodes: [], edges: [] };

    const ids = new Set(uniqueNodes.map((node) => node.id));
    const validEdges = edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));

    const dagre = new Graph({ directed: true, multigraph: true });
    dagre.setGraph({ rankdir: 'TB', nodesep: 20, ranksep: 44, marginx: 8, marginy: 8 });
    dagre.setDefaultEdgeLabel(() => ({}));

    for (const node of uniqueNodes) {
      dagre.setNode(node.id, { width: nodeWidth(node.label), height: NODE_HEIGHT });
    }

    for (const [index, edge] of validEdges.entries()) {
      dagre.setEdge(
        edge.from,
        edge.to,
        edge.label
          ? { width: Math.min(140, edge.label.length * 6 + 12), height: 16 }
          : { width: 0, height: 0 },
        `edge-${index}`,
      );
    }

    layout(dagre);

    const laidOutNodes: LaidOutNode[] = uniqueNodes.map((node) => {
      const position = dagre.node(node.id);
      return {
        ...node,
        x: position.x ?? 0,
        y: position.y ?? 0,
        width: position.width,
        height: position.height,
      };
    });

    const laidOutEdges: LaidOutEdge[] = validEdges.map((edge, index) => {
      const position = dagre.edge({ v: edge.from, w: edge.to, name: `edge-${index}` });
      return {
        ...edge,
        points: position.points ?? [],
        labelX: position.x,
        labelY: position.y,
      };
    });

    return {
      width: dagre.graph().width ?? 0,
      height: dagre.graph().height ?? 0,
      nodes: laidOutNodes,
      edges: laidOutEdges,
    };
  }, [nodes, edges]);

  const zoomBy = useCallback((factor: number) => {
    setTransform((current) => ({ ...current, scale: clampScale(current.scale * factor) }));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      setTransform((current) => ({
        ...current,
        scale: clampScale(current.scale * (event.deltaY < 0 ? 1.1 : 0.9)),
      }));
    }

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 2) {
      const [first, second] = Array.from(pointersRef.current.values());
      if (first && second) {
        pinchRef.current = {
          distance: Math.hypot(first.x - second.x, first.y - second.y),
          scale: transform.scale,
        };
      }
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const previous = pointersRef.current.get(event.pointerId);
    if (!previous) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [first, second] = Array.from(pointersRef.current.values());
      if (first && second) {
        const distance = Math.hypot(first.x - second.x, first.y - second.y);
        if (pinchRef.current.distance > 0) {
          const nextScale = clampScale(
            (pinchRef.current.scale * distance) / pinchRef.current.distance,
          );
          setTransform((current) => ({ ...current, scale: nextScale }));
        }
      }
      return;
    }

    const deltaX = event.clientX - previous.x;
    const deltaY = event.clientY - previous.y;
    setTransform((current) => ({ ...current, x: current.x + deltaX, y: current.y + deltaY }));
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
  }

  function selectNode(node: ConceptNode) {
    setSelectedId(node.id);
    onNodeSelect?.(node.id);
  }

  const selected = selectedId ? nodes.find((node) => node.id === selectedId) : undefined;

  if (graph.nodes.length === 0) {
    return (
      <div
        className={cn(
          'border-border bg-surface-2 text-text-muted rounded-[var(--radius-card)] border p-6 text-center text-small',
          className,
        )}
      >
        {t('empty')}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-h3">{title ?? t('title')}</h3>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('zoomOut')}
            onClick={() => zoomBy(0.8)}
          >
            <MinusIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('zoomIn')}
            onClick={() => zoomBy(1.25)}
          >
            <PlusIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('resetZoom')}
            onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}
          >
            <RotateCcwIcon aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        role="group"
        aria-label={t('ariaLabel')}
        className="border-border bg-surface relative h-[320px] w-full touch-none overflow-hidden rounded-[var(--radius-card)] border sm:h-[400px]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg
          viewBox={`0 0 ${graph.width} ${graph.height}`}
          role="img"
          aria-label={t('ariaLabel')}
          className="h-full w-full cursor-grab active:cursor-grabbing"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transition: 'transform var(--duration-fast) var(--ease-out-soft)',
          }}
        >
          <defs>
            <marker
              id="concept-map-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--border)" />
            </marker>
          </defs>

          {graph.edges.map((edge, index) => {
            const from = graph.nodes.find((node) => node.id === edge.from);
            const last = edge.points[edge.points.length - 1];
            if (!from || edge.points.length === 0) return null;
            const path = edge.points.map((point) => `${point.x},${point.y}`).join(' ');
            return (
              <g key={`${edge.from}-${edge.to}-${index}`}>
                <polyline
                  points={path}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="1.5"
                  markerEnd="url(#concept-map-arrow)"
                />
                {edge.label && last ? (
                  <text
                    x={edge.labelX ?? last.x}
                    y={edge.labelY ?? last.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="10"
                    fill="var(--text-muted)"
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          {graph.nodes.map((node) => {
            const style = nodeStyles[node.kind];
            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={t('nodeAria', { label: node.label, kind: t(`kinds.${node.kind}`) })}
                aria-pressed={selectedId === node.id}
                onClick={() => selectNode(node)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectNode(node);
                  }
                }}
                className="cursor-pointer focus-visible:outline-none"
              >
                <title>{node.label}</title>
                <rect
                  x={node.x - node.width / 2}
                  y={node.y - node.height / 2}
                  width={node.width}
                  height={node.height}
                  rx="10"
                  fill={style.fill}
                  stroke={selectedId === node.id ? 'var(--primary)' : style.stroke}
                  strokeWidth={selectedId === node.id ? 2.5 : 1.5}
                />
                <text
                  x={node.x}
                  y={node.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="12"
                  fontWeight="600"
                  fill={style.text}
                >
                  {truncate(node.label, node.width)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="text-caption text-text-muted">{t('hint')}</p>

      <div
        role="status"
        aria-live="polite"
        className="border-border bg-surface-2 rounded-[var(--radius-input)] border px-3 py-2"
      >
        {selected ? (
          <>
            <span className="text-caption text-text-muted block">{t('selectedLabel')}</span>
            <span className="text-small font-semibold">{selected.label}</span>{' '}
            <span className="text-caption text-text-muted">
              {t(`kinds.${selected.kind}`)}
            </span>
          </>
        ) : (
          <span className="text-small text-text-muted">{t('noSelection')}</span>
        )}
      </div>
    </div>
  );
}
