import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { useApp } from '../context/AppContext';

export default function StackHeader({
  title,
  right,
  transparent,
}: {
  title?: string;
  right?: React.ReactNode;
  transparent?: boolean;
}) {
  const { actions } = useApp();
  return (
    <SafeAreaView edges={['top']} style={[styles.wrap, transparent && { backgroundColor: 'transparent', borderBottomWidth: 0, position: 'absolute', left: 0, right: 0, top: 0, zIndex: 20 }]}>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={actions.pop} hitSlop={8} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text numberOfLines={1} style={styles.title}>{title || ''}</Text>
        <View style={styles.right}>{right}</View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' },
  right: { minWidth: 40, alignItems: 'flex-end', justifyContent: 'center' },
});
