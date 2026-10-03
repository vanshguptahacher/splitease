import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ActivityList, AppHeader, OfflineBanner, Screen } from '@/components';
import { useActivity } from '@/hooks';

export default function ActivityTabScreen() {
  const { refetch } = useActivity();

  // Refetch when tab comes into focus
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  return (
    <Screen padding={false}>
      <OfflineBanner />
      <AppHeader title="Activity" subtitle="Recent transactions & updates" />
      <View style={styles.container}>
        <ActivityList />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

