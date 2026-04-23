import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { Recipe } from '../services/api';

interface Props {
  recipe: Recipe;
  onPress: () => void;
  onToggleSave?: () => void;
}

export default function RecipeCard({ recipe, onPress, onToggleSave }: Props) {
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {recipe.image_url ? (
        <Image source={{ uri: recipe.image_url }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <Ionicons name="restaurant-outline" size={32} color={Colors.fgMuted} />
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={styles.title} numberOfLines={1}>{recipe.title}</Text>
          {onToggleSave && (
            <TouchableOpacity onPress={onToggleSave} hitSlop={8}>
              <Ionicons
                name={recipe.is_saved ? 'heart' : 'heart-outline'}
                size={18}
                color={recipe.is_saved ? Colors.accent : Colors.fgMuted}
              />
            </TouchableOpacity>
          )}
        </View>
        {recipe.description ? (
          <Text style={styles.desc} numberOfLines={2}>{recipe.description}</Text>
        ) : null}
        <View style={styles.meta}>
          {totalTime > 0 && (
            <View style={styles.chip}>
              <Ionicons name="time-outline" size={12} color={Colors.fgMuted} />
              <Text style={styles.chipText}>{totalTime} min</Text>
            </View>
          )}
          {recipe.servings > 0 && (
            <View style={styles.chip}>
              <Ionicons name="people-outline" size={12} color={Colors.fgMuted} />
              <Text style={styles.chipText}>{recipe.servings}</Text>
            </View>
          )}
          {recipe.difficulty && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{recipe.difficulty}</Text>
            </View>
          )}
          {recipe.category ? (
            <View style={[styles.chip, styles.chipAccent]}>
              <Text style={[styles.chipText, styles.chipTextAccent]}>{recipe.category}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 16,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 160,
  },
  placeholder: {
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: 14,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 17,
    color: Colors.fgPrimary,
    marginRight: 8,
  },
  desc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.fgSecondary,
    lineHeight: 19,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.surfacePrimary,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipAccent: {
    backgroundColor: Colors.accent + '22',
  },
  chipText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.fgMuted,
  },
  chipTextAccent: {
    color: Colors.accent,
    fontWeight: '600',
  },
});
