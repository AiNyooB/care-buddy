/**
 * 引导锻炼配置数据
 * 为运动库中每个动作配置引导模式参数
 * 独立文件，不污染原有 exercises.ts 数据
 */

import type { GuidedConfig } from '../types';

export interface GuidedExerciseConfig {
  guidedConfig?: GuidedConfig;
  isContinuous?: boolean;
}

/**
 * 每个动作的引导配置映射表
 * key = exercise.id
 *
 * 说明：
 * - beatMode: true 表示全程节拍模式（快速动态动作，step≤3s自动用节拍音）
 * - transitionDuration: step 结束后到下一步的过渡时间（秒），默认0.5s
 * - 换边/切换方向的过渡通过 transitionDuration 实现，不再手动插入"准备"step
 */
export const guidedExerciseConfigs: Record<string, GuidedExerciseConfig> = {
  // ==================== 视力保护 (Vision) ====================

  // E-01: 20-20-20法则 - 仅需注视远处，无分步引导
  'E-01': {},

  // E-02: 意识性眨眼练习 - 闭合/张开 循环（2秒/2秒快速交替）
  'E-02': {
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      transitionDuration: 0.3,
      cycle: [
        { text: '闭合', instruction: '轻轻闭合双眼', duration: 2 },
        { text: '张开', instruction: '缓缓张开双眼', duration: 2 },
      ],
      repetitions: 15,
    },
  },

  // E-03: 拇指远近交替注视 - 近/远 交替（5秒/5秒，需要时间对焦）
  'E-03': {
    guidedConfig: {
      prepCountdown: 3,
      transitionDuration: 0.8,
      cycle: [
        { text: '注视拇指', instruction: '清晰注视距眼睛25cm处的拇指指纹', duration: 5 },
        { text: '注视远处', instruction: '转移视线注视6米外的远处物体', duration: 5 },
      ],
      repetitions: 10,
    },
  },

  // E-04: 手掌热敷眼 - 单段持续
  'E-04': {
    guidedConfig: {
      prepCountdown: 3,
      cycle: [
        { text: '掌心搓热，轻敷双眼', instruction: '双手搓热，掌心轻扣在闭起的双眼上', duration: 30 },
      ],
      repetitions: 1,
    },
  },

  // E-05: 四方向眼球运动 - 序列完成8个方向（各2秒，快速切换）
  'E-05': {
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      transitionDuration: 0.3,
      cycle: [
        { text: '向上看', instruction: '眼球缓慢看向正上方，保持不动', duration: 2 },
        { text: '向下看', instruction: '眼球缓慢看向正下方', duration: 2 },
        { text: '向左看', instruction: '眼球缓慢看向正左方', duration: 2 },
        { text: '向右看', instruction: '眼球缓慢看向正右方', duration: 2 },
        { text: '看向右上', instruction: '眼球缓慢看向右上方向', duration: 2 },
        { text: '看向左下', instruction: '眼球缓慢看向左下方向', duration: 2 },
        { text: '看向左上', instruction: '眼球缓慢看向左上方向', duration: 2 },
        { text: '看向右下', instruction: '眼球缓慢看向右下方向', duration: 2 },
      ],
      repetitions: 1,
    },
  },

  // E-06: 眼周穴位按压 - 单段
  'E-06': {
    guidedConfig: {
      prepCountdown: 3,
      cycle: [
        { text: '按压眼周穴位', instruction: '用食指关节轻压眼眶骨缘各点，每点画小圆10次', duration: 60 },
      ],
      repetitions: 1,
    },
  },

  // ==================== 脊柱与骨骼 (Spine) ====================

  // S-01: 颈椎回缩 - 回缩/放松 循环（5秒/5秒）
  'S-01': {
    guidedConfig: {
      prepCountdown: 3,
      transitionDuration: 0.5,
      cycle: [
        { text: '向后回缩', instruction: '下巴平行于地面向后收，感受颈椎后侧拉伸', duration: 5 },
        { text: '放松回正', instruction: '缓慢放松回到中立位', duration: 5 },
      ],
      repetitions: 10,
    },
  },

  // S-02: 髋屈肌弓步拉伸 - 单侧保持（30s/侧，换边2秒自动过渡）
  'S-02': {
    guidedConfig: {
      prepCountdown: 3,
      cycle: [
        { text: '拉伸右侧髋屈肌', instruction: '右腿在前弓步，髋部向前下方沉', duration: 30, transitionDuration: 2 },
        { text: '拉伸左侧髋屈肌', instruction: '左腿在前弓步，髋部向前下方沉', duration: 30 },
      ],
      repetitions: 1,
    },
  },

  // S-03: 肩胛骨回缩 - 夹紧/放松 循环（5秒/5秒）
  'S-03': {
    guidedConfig: {
      prepCountdown: 3,
      transitionDuration: 0.5,
      cycle: [
        { text: '夹紧肩胛骨', instruction: '将两侧肩胛骨向脊柱中线夹紧', duration: 5 },
        { text: '放松', instruction: '缓慢放松双肩', duration: 5 },
      ],
      repetitions: 15,
    },
  },

  // S-04: 胸椎后伸 - 后伸/坐直 循环（3秒/2秒）
  'S-04': {
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      transitionDuration: 0.3,
      cycle: [
        { text: '向后伸展', instruction: '双手抱头，以椅背上缘为支点向后伸展胸椎', duration: 3 },
        { text: '缓慢坐直', instruction: '缓慢坐直回到中立位', duration: 2 },
      ],
      repetitions: 5,
    },
  },

  // S-05: 梨状肌坐姿拉伸 - 单侧保持（30s/侧，换边2秒自动过渡）
  'S-05': {
    guidedConfig: {
      prepCountdown: 3,
      cycle: [
        { text: '拉伸右侧梨状肌', instruction: '右脚踝搭在左膝上，身体前倾', duration: 30, transitionDuration: 2 },
        { text: '拉伸左侧梨状肌', instruction: '左脚踝搭在右膝上，身体前倾', duration: 30 },
      ],
      repetitions: 1,
    },
  },

  // S-06: 猫牛式 - 牛式/猫式 循环（3秒/3秒）
  'S-06': {
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      transitionDuration: 0.3,
      cycle: [
        { text: '牛式', instruction: '吸气，骨盆前倾，腰椎塌陷，抬头', duration: 3 },
        { text: '猫式', instruction: '呼气，骨盆后倾，腰椎拱起，低头', duration: 3 },
      ],
      repetitions: 10,
    },
  },

  // S-07: 肩胛提肌拉伸 - 单侧保持（30s/侧，换边2秒自动过渡）
  'S-07': {
    guidedConfig: {
      prepCountdown: 3,
      cycle: [
        { text: '拉伸右侧', instruction: '右手固定椅子，左手将头向左前方拉', duration: 30, transitionDuration: 2 },
        { text: '拉伸左侧', instruction: '左手固定椅子，右手将头向右前方拉', duration: 30 },
      ],
      repetitions: 1,
    },
  },

  // S-08: 单膝抱胸 - 左/右 循环（10秒/10秒）
  'S-08': {
    guidedConfig: {
      prepCountdown: 3,
      transitionDuration: 1,
      cycle: [
        { text: '抱右膝', instruction: '双手抱住右膝缓慢拉向胸口', duration: 10 },
        { text: '抱左膝', instruction: '缓慢放下右腿，双手抱住左膝拉向胸口', duration: 10 },
      ],
      repetitions: 3,
    },
  },

  // ==================== 血液循环 (Circulation) ====================

  // C-01: 踝泵运动 - 勾/绷 循环（2秒/2秒快速交替）
  'C-01': {
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      transitionDuration: 0.2,
      cycle: [
        { text: '勾起脚尖', instruction: '缓慢勾起脚尖（背屈），感受小腿前侧拉伸', duration: 2 },
        { text: '绷直脚尖', instruction: '缓慢绷直脚尖（跖屈），感受小腿后侧收缩', duration: 2 },
      ],
      repetitions: 30,
    },
  },

  // C-02: 膈肌腹式呼吸 - 吸/呼 循环（4秒/6秒，呼吸引导）
  'C-02': {
    guidedConfig: {
      prepCountdown: 3,
      transitionDuration: 0.5,
      cycle: [
        { text: '吸气', instruction: '鼻子缓慢吸气4秒，让腹部隆起', duration: 4 },
        { text: '呼气', instruction: '嘴巴缓慢呼气6秒，感受腹部下沉', duration: 6 },
      ],
      repetitions: 10,
    },
  },

  // C-03: 站立提踵 - 提/放 循环（1秒/1秒快速交替）
  'C-03': {
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      transitionDuration: 0.2,
      cycle: [
        { text: '踮起脚尖', instruction: '缓慢踮起脚尖至最高点', duration: 1 },
        { text: '缓慢放下', instruction: '控制速度缓慢放下脚跟', duration: 1 },
      ],
      repetitions: 20,
    },
  },

  // C-04: 坐姿腿部伸展 - 伸/放 循环（3秒/3秒）
  'C-04': {
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      transitionDuration: 0.3,
      cycle: [
        { text: '伸展右腿', instruction: '右腿慢慢向前伸直，收紧大腿前侧肌肉', duration: 3 },
        { text: '交替左腿', instruction: '缓慢放下右腿，换左腿向前伸直', duration: 3 },
      ],
      repetitions: 15,
    },
  },

  // C-05: 原地高抬腿踏步 - 持续活动（节拍引导）
  'C-05': {
    isContinuous: true,
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      cycle: [
        { text: '原地高抬腿', instruction: '交替将膝盖抬至腰部高度，手臂自然摆动', duration: 30 },
      ],
      repetitions: 1,
    },
  },

  // C-06: 坐站交替 - 站/坐 循环（1秒/1秒快速交替）
  'C-06': {
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      transitionDuration: 0.2,
      cycle: [
        { text: '站起', instruction: '从椅子上慢慢站起，不借助手臂', duration: 1 },
        { text: '坐下', instruction: '缓慢坐下，控制下降速度', duration: 1 },
      ],
      repetitions: 15,
    },
  },

  // C-07: 仰卧腿部抬高 - 需仰卧，手动完成
  'C-07': {},

  // ==================== 代谢激活 (Metabolism) ====================

  // M-01: 坐站交替（代谢）- 同 C-06（1秒/1秒快速交替）
  'M-01': {
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      transitionDuration: 0.2,
      cycle: [
        { text: '站起', instruction: '从椅子上慢慢站起，不借助手臂', duration: 1 },
        { text: '坐下', instruction: '缓慢坐下，控制下降速度', duration: 1 },
      ],
      repetitions: 15,
    },
  },

  // M-02: 臀桥 - 抬/放 循环（2秒/2秒）
  'M-02': {
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      transitionDuration: 0.3,
      cycle: [
        { text: '抬起髋部', instruction: '臀部发力将髋部抬离地面，躯干和大腿成一直线', duration: 2 },
        { text: '缓慢放下', instruction: '控制速度缓慢放下髋部', duration: 2 },
      ],
      repetitions: 15,
    },
  },

  // M-03: 椅子深蹲 - 蹲/站 循环（1秒/1秒快速交替）
  'M-03': {
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      transitionDuration: 0.2,
      cycle: [
        { text: '下蹲', instruction: '缓慢后坐下蹲，臀部触碰椅面', duration: 1 },
        { text: '站起', instruction: '立即站起回到起始位置', duration: 1 },
      ],
      repetitions: 15,
    },
  },

  // M-04: 弓步 - 左/右 交替（弓步2s+收回1s快速切换）
  'M-04': {
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      transitionDuration: 0.2,
      cycle: [
        { text: '右腿弓步', instruction: '右脚向前迈一大步，后腿膝盖下降', duration: 2 },
        { text: '收回', instruction: '站起收回右腿回到中立位', duration: 1, beat: true },
        { text: '左腿弓步', instruction: '左脚向前迈一大步，后腿膝盖下降', duration: 2 },
        { text: '收回', instruction: '站起收回左腿回到中立位', duration: 1, beat: true },
      ],
      repetitions: 10,
    },
  },

  // M-05: 靠墙静蹲 - 持续活动（节拍引导）
  'M-05': {
    isContinuous: true,
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      cycle: [
        { text: '靠墙静蹲', instruction: '背靠墙滑下至大腿平行地面，静止保持', duration: 30 },
      ],
      repetitions: 1,
    },
  },

  // M-06: 开合跳 - 持续活动（节拍引导）
  'M-06': {
    isContinuous: true,
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      cycle: [
        { text: '开合跳', instruction: '双脚开合跳跃，双手举过头顶', duration: 30 },
      ],
      repetitions: 1,
    },
  },

  // M-07: 墙壁俯卧撑 - 推/回 循环（1秒/1秒快速交替）
  'M-07': {
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      transitionDuration: 0.2,
      cycle: [
        { text: '靠近墙壁', instruction: '弯曲手肘让胸口靠近墙面', duration: 1 },
        { text: '推回', instruction: '手臂发力推回起始位置', duration: 1 },
      ],
      repetitions: 15,
    },
  },

  // ==================== 神经/腕部 (Wrist) ====================

  // W-01: 正中神经滑动练习 - 7个姿势序列（各5秒，稍慢）
  'W-01': {
    guidedConfig: {
      prepCountdown: 3,
      transitionDuration: 0.8,
      cycle: [
        { text: '手伸直', instruction: '手臂向前伸直，手掌朝上', duration: 5 },
        { text: '握拳', instruction: '缓慢握紧拳头', duration: 5 },
        { text: '钩形', instruction: '手指弯曲呈钩形', duration: 5 },
        { text: '桌面形', instruction: '掌骨弯曲，手指伸直', duration: 5 },
        { text: '手指后弯', instruction: '手指缓慢向后弯曲', duration: 5 },
        { text: '拇指展开', instruction: '拇指向外充分展开', duration: 5 },
        { text: '下压拇指', instruction: '用另一只手帮助向下压拇指至极限', duration: 5 },
      ],
      repetitions: 3,
    },
  },

  // W-02: 祈祷式腕部拉伸 - 正/反 循环（15秒/15秒保持）
  'W-02': {
    guidedConfig: {
      prepCountdown: 3,
      transitionDuration: 1.5,
      cycle: [
        { text: '祈祷式拉伸', instruction: '双手合十，手肘外展，向下压低双手', duration: 15 },
        { text: '反向祈祷式', instruction: '双手手背相合，抬高至胸口高度', duration: 15 },
      ],
      repetitions: 2,
    },
  },

  // W-03: 肩外旋练习 - 外旋/回正 循环（3秒/3秒）
  'W-03': {
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      transitionDuration: 0.3,
      cycle: [
        { text: '向外旋转', instruction: '肘贴身体，小臂向外旋转如打开书页', duration: 3 },
        { text: '回正', instruction: '缓慢回到中立位', duration: 3 },
      ],
      repetitions: 15,
    },
  },

  // W-04: 尺神经滑动练习 - 弯/伸 循环（5秒/2秒）
  'W-04': {
    guidedConfig: {
      prepCountdown: 3,
      transitionDuration: 0.5,
      cycle: [
        { text: '弯曲手肘', instruction: '手臂前伸，弯曲肘部将手背靠近耳朵', duration: 5 },
        { text: '伸直手肘', instruction: '缓慢伸直手肘回到起始位置', duration: 2 },
      ],
      repetitions: 10,
    },
  },

  // W-05: 腕关节环绕 - 顺/逆 循环（5秒/5秒）
  'W-05': {
    guidedConfig: {
      prepCountdown: 3,
      transitionDuration: 0.5,
      cycle: [
        { text: '顺时针环绕', instruction: '双手合十顺时针画大圆', duration: 5 },
        { text: '逆时针环绕', instruction: '双手合十逆时针画大圆', duration: 5 },
      ],
      repetitions: 3,
    },
  },

  // W-06: 握拳伸展 - 握/张 循环（2秒/2秒快速交替）
  'W-06': {
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      transitionDuration: 0.2,
      cycle: [
        { text: '用力握拳', instruction: '双手用力握拳至最紧', duration: 2 },
        { text: '张开五指', instruction: '迅速将五指张开至最大', duration: 2 },
      ],
      repetitions: 15,
    },
  },

  // W-07: 肩部绕环 - 后/前 循环（3秒/3秒）
  'W-07': {
    guidedConfig: {
      prepCountdown: 3,
      beatMode: true,
      transitionDuration: 0.3,
      cycle: [
        { text: '向后绕环', instruction: '双肩同时向后做完整绕环', duration: 3 },
        { text: '向前绕环', instruction: '双肩同时向前做完整绕环', duration: 3 },
      ],
      repetitions: 5,
    },
  },

  // W-08: 手指对抗拉伸 - 单次
  'W-08': {
    guidedConfig: {
      prepCountdown: 3,
      cycle: [
        { text: '拉伸手指', instruction: '用另一手拇指轻柔地将每根手指向背侧弯曲，每根保持10秒', duration: 50 },
      ],
      repetitions: 1,
    },
  },
};
