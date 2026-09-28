import type { UrgentStory } from "@/lib/admin/dashboard-data";
import { STORY_STATUS_LABELS, eventTypeLabel, formatNewsroomTime } from "@/lib/admin/labels";

export function UrgentStories({ stories }: { stories: UrgentStory[] }) {
  if (stories.length === 0) {
    return <p className="mt-4 text-sm text-neutral-600">Brak pilnych historii.</p>;
  }

  return (
    <ul className="mt-4 space-y-3">
      {stories.map((story) => (
        <li key={story.id} className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="font-medium">{story.title}</p>
          <p className="mt-1 text-xs text-neutral-600">
            {STORY_STATUS_LABELS[story.status]} · {eventTypeLabel(story.eventType)} · waga{" "}
            {story.importance} · aktualizacja {formatNewsroomTime(story.lastUpdatedAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}
