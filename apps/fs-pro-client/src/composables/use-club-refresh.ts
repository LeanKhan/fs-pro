import { useQueryClient } from '@tanstack/vue-query';
import { useStore } from '@/store';

/** What a dashboard zone's `update-available` should reload: the club, its
 * open-play queries and the calendar. Shared by the dashboard and the campus. */
export function useClubRefresh() {
  const store = useStore();
  const queryClient = useQueryClient();
  return (clubId: string | undefined) =>
    clubId
      ? Promise.all([
          store.setCalendar(),
          queryClient.invalidateQueries({ queryKey: ['club', clubId] }),
          queryClient.invalidateQueries({ queryKey: ['club-league'] }),
          queryClient.invalidateQueries({ queryKey: ['club-entries'] }),
          queryClient.invalidateQueries({ queryKey: ['club-fixtures'] }),
        ])
      : Promise.resolve();
}
