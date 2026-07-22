import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Mars, Venus, Eye, EyeOff } from 'lucide-react';
import { useHealthStore } from '@/store';
import { exercisePackages, exercises } from '@/data/exercises';
import { getRecommendedPackageId } from '@/utils/recommend';
import { PackageBackdrop, type CharacterGender } from './PackageBackdrop';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getStorage, setStorage, STORAGE_KEYS } from '@/utils/storage';

const exerciseNameById = Object.fromEntries(exercises.map((e) => [e.id, e.name]));

// 卡片区在「开推荐(大卡+2小卡)」与「关推荐(3 等宽自然高卡)」两种结构间
// 用 layoutId 共享布局形变;曲线与 App.tsx 一致。
const CARD_LAYOUT_TRANSITION = {
  layout: { duration: 0.32, ease: [0.32, 0.72, 0, 1] as const },
} as const;

export function PackageHero() {
  const { t } = useTranslation();
  const openExercisePanel = useHealthStore((s) => s.openExercisePanel);
  const showRecommendation = useHealthStore((s) => s.settings.showRecommendation);
  const updateSettings = useHealthStore((s) => s.updateSettings);
  const [gender, setGender] = useState<CharacterGender>(() =>
    getStorage<CharacterGender>(STORAGE_KEYS.CHARACTER_GENDER, 'male')
  );
  useEffect(() => {
    setStorage(STORAGE_KEYS.CHARACTER_GENDER, gender);
  }, [gender]);

  // 是否显示「当前推荐」大卡：开启时按时间段规则选出套餐，关闭时三卡平铺
  const recommendedId = showRecommendation ? getRecommendedPackageId() : null;

  // 副标题随今日已完成次数切换语气：纯解释/鼓励，无交互
  const done = useHealthStore((s) => s.todayStats.exercisesCompleted);
  const caption =
    done === 0 ? t('exercise.encourageIdle')
    : done < 3 ? t('exercise.encourageStart')
    : t('exercise.encourageGood');
  const recommended = recommendedId
    ? exercisePackages.find((p) => p.id === recommendedId)!
    : null;
  const others = recommendedId
    ? exercisePackages.filter((p) => p.id !== recommendedId)
    : [];
  const recommendedNames = recommended
    ? (recommended.exercises
        .map((e) => exerciseNameById[e.exerciseId])
        .filter(Boolean) as string[])
    : [];
  const MAX_VISIBLE = 6; // 2 行 × 约 3 个/行；按名字长度微调
  const visibleNames = recommendedNames.slice(0, MAX_VISIBLE);
  const restCount = recommendedNames.length - visibleNames.length;

  return (
    // 注: 此处不使用 overflow-hidden。border-radius 仅圆角 hero 自身背景与
    // 边框, 不会裁切子元素; 裁切底部卡片方角需 overflow-hidden, 但会连带
    // 裁掉顶部光晕/背景图与未来悬浮动效, 故此处刻意保留可见、由卡片方角自行处理。
    <div
      className="relative h-[270px] shrink-0 rounded-[18px]"
    >
      <PackageBackdrop gender={gender} />

      {/* 标题行：活动 + 两个快捷切换按钮（形象 / 当前推荐） */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between">
        <h2 className="text-type-page-title text-foreground drop-shadow-sm">
          {t('tabs.exercise')}
        </h2>
        <div className="flex items-center gap-2">
          {/* 形象切换：点一下直接换男/女并切换背景图 */}
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t('exercise.characterSwitch')}
            onClick={() => setGender(gender === 'male' ? 'female' : 'male')}
            className="h-7 w-7 rounded-md border-border bg-card/70"
          >
            {gender === 'male' ? <Mars size={16} /> : <Venus size={16} />}
          </Button>
          {/* 当前推荐开关：眼睛开=显示 / 眼睛闭=隐藏 */}
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t('exercise.showRecommendation')}
            onClick={() => updateSettings({ showRecommendation: !showRecommendation })}
            className="h-7 w-7 rounded-md border-border bg-card/70"
          >
            {showRecommendation ? <Eye size={16} /> : <EyeOff size={16} />}
          </Button>
        </div>
      </div>

      {/* 说明文字 + 套餐卡片区：统一纵向流，说明文字与卡片保持 12px (gap-3) */}
      <div className="absolute inset-x-0 top-[90px] bottom-0 z-20 flex flex-col justify-end gap-3">
        <p className="text-type-caption text-muted-foreground/90 drop-shadow-sm">
          {caption}
        </p>

        {/* 套餐卡片区: 两种结构靠 layoutId 共享布局形变 (layout morph) */}
        {showRecommendation && recommended ? (
          <div className="flex h-[148px] items-end gap-3">
          {/* 大卡：当前推荐套餐（含呼吸式活动名） */}
          <motion.button
            layout
            layoutId={recommended.id}
            transition={CARD_LAYOUT_TRANSITION}
            type="button"
            onClick={() => openExercisePanel(recommended.id)}
            aria-label={t('categories.' + recommended.id)}
            className="group flex h-full w-[292px] flex-col gap-1.5 overflow-hidden rounded-[10px] border border-border bg-card/80 p-3 text-left shadow-none ring-0 outline-none transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary hover:bg-card  focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
          >
            <motion.div layout="position" className="min-w-0">
              <h3 className="truncate text-type-section-title text-foreground">{t('categories.' + recommended.id)}</h3>
              <p className="mt-0.5 text-type-caption text-muted-foreground">
                {recommended.duration}
                {t('time.minutes')} · {recommended.exercises.length}
                {t('exercise.items')}
              </p>
            </motion.div>
            <div className="flex flex-1 flex-wrap content-start gap-x-1.5 gap-y-1.5 overflow-hidden">
              {visibleNames.map((name, i) => (
                <Badge
                  key={`${name}-${i}`}
                  variant="outline"
                  className="font-normal"
                >
                  {name}
                </Badge>
              ))}
              {restCount > 0 && (
                <span className="inline-flex h-5 shrink-0 items-center justify-center whitespace-nowrap rounded-4xl border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                  +{restCount}
                </span>
              )}
            </div>
          </motion.button>

          {/* 右侧：两张小卡 */}
          <div className="flex h-full w-[140px] flex-col gap-3">
            {others.map((pkg) => (
              <motion.button
                key={pkg.id}
                layout
                layoutId={pkg.id}
                transition={CARD_LAYOUT_TRANSITION}
                type="button"
                onClick={() => openExercisePanel(pkg.id)}
                aria-label={t('categories.' + pkg.id)}
                className="group flex h-[68px] shrink-0 flex-col justify-center overflow-hidden rounded-[10px] border border-border bg-card/80 p-3 text-left shadow-none ring-0 outline-none transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary hover:bg-card  focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
              >
                <motion.div layout="position">
                  <h3 className="truncate text-type-section-title text-foreground">{t('categories.' + pkg.id)}</h3>
                  <p className="mt-0.5 text-type-caption text-muted-foreground">
                    {pkg.duration}
                    {t('time.minutes')} · {pkg.exercises.length}
                    {t('exercise.items')}
                  </p>
                </motion.div>
              </motion.button>
            ))}
          </div>
        </div>
      ) : (
        // 关闭当前推荐：三张等宽卡片横向平铺, 高度随内容自然撑开 (底部对齐)
        <div className="flex items-end gap-3">
          {exercisePackages.map((pkg) => (
            <motion.button
              key={pkg.id}
              layout
              layoutId={pkg.id}
              transition={CARD_LAYOUT_TRANSITION}
              type="button"
              onClick={() => openExercisePanel(pkg.id)}
              aria-label={t('categories.' + pkg.id)}
              className="group flex flex-1 flex-col justify-center gap-1 overflow-hidden rounded-[10px] border border-border bg-card/80 p-3 text-left shadow-none ring-0 outline-none transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary hover:bg-card  focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
            >
              <motion.div layout="position">
                <h3 className="truncate text-type-section-title text-foreground">{t('categories.' + pkg.id)}</h3>
                <p className="mt-0.5 text-type-caption text-muted-foreground">
                  {pkg.duration}
                  {t('time.minutes')} · {pkg.exercises.length}
                  {t('exercise.items')}
                </p>
              </motion.div>
            </motion.button>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
