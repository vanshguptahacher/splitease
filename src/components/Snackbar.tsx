import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/lib/theme';

export interface SnackbarAction {
  label: string;
  onPress: () => void;
}

export interface SnackbarOptions {
  message: string;
  action?: SnackbarAction;
  duration?: number; // ms, default 4000
}

interface SnackbarContextType {
  showSnackbar: (options: SnackbarOptions) => void;
  hideSnackbar: () => void;
}

const SnackbarContext = createContext<SnackbarContextType | null>(null);

export function useSnackbar(): SnackbarContextType {
  const context = useContext(SnackbarContext);
  if (!context) {
    return {
      showSnackbar: () => {},
      hideSnackbar: () => {},
    };
  }
  return context;
}

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<SnackbarOptions | null>(null);
  const queueRef = useRef<SnackbarOptions[]>([]);
  const isDisplayingRef = useRef(false);
  const displayNextRef = useRef<() => void>(() => {});

  const [opacityAnim] = useState(() => new Animated.Value(0));
  const [translateYAnim] = useState(() => new Animated.Value(24));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissCurrent = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 24,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      isDisplayingRef.current = false;
      setCurrent(null);
      if (queueRef.current.length > 0) {
        displayNextRef.current();
      }
    });
  }, [opacityAnim, translateYAnim]);

  const displayItem = useCallback(
    (item: SnackbarOptions) => {
      isDisplayingRef.current = true;
      setCurrent(item);
      translateYAnim.setValue(24);
      opacityAnim.setValue(0);

      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(translateYAnim, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
        }),
      ]).start();

      const duration = item.duration ?? 4000;
      timerRef.current = setTimeout(() => {
        dismissCurrent();
      }, duration);
    },
    [opacityAnim, translateYAnim, dismissCurrent]
  );

  useEffect(() => {
    displayNextRef.current = () => {
      if (queueRef.current.length > 0) {
        const next = queueRef.current.shift()!;
        displayItem(next);
      }
    };
  }, [displayItem]);

  const showSnackbar = useCallback(
    (options: SnackbarOptions) => {
      if (!isDisplayingRef.current) {
        displayItem(options);
      } else {
        queueRef.current.push(options);
      }
    },
    [displayItem]
  );

  const handleAction = () => {
    if (current?.action?.onPress) {
      current.action.onPress();
    }
    dismissCurrent();
  };

  const bottomOffset = insets.bottom + 68;

  return (
    <SnackbarContext.Provider value={{ showSnackbar, hideSnackbar: dismissCurrent }}>
      {children}
      {current && (
        <Animated.View
          style={[
            styles.container,
            {
              bottom: bottomOffset,
              opacity: opacityAnim,
              transform: [{ translateY: translateYAnim }],
            },
          ]}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.snackbarBox,
              {
                backgroundColor: theme.isDark ? '#334155' : '#1E293B',
                borderRadius: theme.radius.card,
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: theme.spacing.md,
              },
            ]}
          >
            <Text
              style={[
                theme.typography.body,
                styles.message,
                { color: '#F8FAFC' },
              ]}
              numberOfLines={2}
            >
              {current.message}
            </Text>

            {current.action && (
              <Pressable
                onPress={handleAction}
                accessibilityRole="button"
                accessibilityLabel={current.action.label}
                style={({ pressed }) => [
                  styles.actionButton,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={[
                    theme.typography.sectionTitle,
                    styles.actionText,
                    { color: '#2DD4BF' },
                  ]}
                >
                  {current.action.label.toUpperCase()}
                </Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      )}
    </SnackbarContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
  },
  snackbarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 520,
    minHeight: 48,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  message: {
    flex: 1,
    marginRight: 12,
  },
  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 48,
    justifyContent: 'center',
  },
  actionText: {
    fontWeight: '700',
    letterSpacing: 0.8,
    fontSize: 14,
  },
});
