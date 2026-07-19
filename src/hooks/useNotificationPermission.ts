import { useEffect } from 'react';
import { requestNotificationPermission } from '@/services';

export function useNotificationPermission() {
  useEffect(() => {
    requestNotificationPermission();
  }, []);
}
