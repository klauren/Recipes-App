import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

const TABS: { route: string; label: string; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap }[] = [
  { route: 'index',   label: 'HOME',    icon: 'home-outline',          iconActive: 'home' },
  { route: 'library', label: 'LIBRARY', icon: 'book-outline',          iconActive: 'book' },
  { route: 'build',   label: 'BUILD',   icon: 'calendar-outline',      iconActive: 'calendar' },
  { route: 'cart',    label: 'CART',    icon: 'bag-outline',           iconActive: 'bag' },
  { route: 'profile', label: 'PROFILE', icon: 'person-outline',        iconActive: 'person' },
];

export default function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    // insets.bottom is the iPhone home-indicator height (0 on devices without one).
    // The extra 4 px creates breathing room above the indicator on notched devices.
    <View style={[styles.wrapper, { paddingBottom: insets.bottom + 4 }]}>
      <View style={styles.pill}>
        {TABS.map((tab, i) => {
          const active = state.index === i;
          return (
            <TouchableOpacity
              key={tab.route}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => navigation.navigate(tab.route)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={active ? tab.iconActive : tab.icon}
                size={18}
                color={active ? Colors.fgInverse : Colors.fgMuted}
              />
              <Text style={[styles.label, active && styles.labelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.surfacePrimary,
    paddingHorizontal: 21,
    paddingTop: 12,
  },
  pill: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 36,
    height: 62,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(140,135,130,0.1)',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    gap: 4,
  },
  tabActive: {
    backgroundColor: Colors.accent,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: Colors.fgMuted,
    fontFamily: 'Inter_600SemiBold',
  },
  labelActive: {
    color: Colors.fgInverse,
  },
});
