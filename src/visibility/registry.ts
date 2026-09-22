import { validatePolicy } from './engine.js'
import * as p from './predicates.js'
import type {
  DropReason,
  InterstitialReason,
  Policy,
  RuleClause,
} from './types.js'

const drop = (
  name: string,
  reason: DropReason,
  appliesTo: RuleClause['appliesTo'],
  ...when: RuleClause['when']
): RuleClause => ({ name, when, appliesTo, action: { kind: 'drop', reason } })

const interstitial = (
  name: string,
  reason: InterstitialReason,
  appliesTo: RuleClause['appliesTo'],
  ...when: RuleClause['when']
): RuleClause => ({
  name,
  when,
  appliesTo,
  action: { kind: 'interstitial', reason },
})

/** 作者状態・到達制御 */
const AUTHOR_STATE_DROPS: RuleClause[] = [
  drop(
    'SuspendedAuthorRule',
    'author_suspended',
    'exceptAuthor',
    p.authorSuspended,
  ),
  drop(
    'NotVisibleToViewerRule',
    'not_visible_to_viewer',
    'exceptAuthor',
    p.notVisibleToViewer,
  ),
]

/** 閲覧者の block / mute (ログイン時のみ意味を持つ) */
const SOCIALGRAPH_DROPS: RuleClause[] = [
  drop(
    'ViewerBlocksAuthorRule',
    'viewer_blocks_author',
    'everyone',
    p.loggedIn,
    p.viewerBlocksAuthor,
  ),
  drop(
    'AuthorBlocksViewerRule',
    'author_blocks_viewer',
    'everyone',
    p.loggedIn,
    p.authorBlocksViewer,
  ),
  drop(
    'ViewerMutesAuthorRule',
    'viewer_mutes_author',
    'everyone',
    p.loggedIn,
    p.viewerMutesAuthor,
  ),
  drop(
    'MutedRenotesRule',
    'viewer_mutes_renotes',
    'everyone',
    p.loggedIn,
    p.isRenote,
    p.viewerMutesRenotes,
  ),
  drop(
    'ViewerMutesInstanceRule',
    'viewer_mutes_instance',
    'everyone',
    p.loggedIn,
    p.viewerMutesInstance,
  ),
  drop(
    'HardWordMuteRule',
    'hard_word_mute',
    'exceptAuthor',
    p.loggedIn,
    p.hardWordMuted,
  ),
]

/** ノートラベルによる drop */
const NOTE_LABEL_DROPS: RuleClause[] = [
  drop(
    'ForEmergencyUseOnlyRule',
    'emergency',
    'everyone',
    p.noteHas('for_emergency_use_only'),
  ),
  drop(
    'LegalTakedownRule',
    'legal_takedown',
    'exceptAuthor',
    p.noteHas('legal_takedown'),
  ),
  drop('SpamNoteRule', 'spam', 'exceptAuthor', p.noteHas('spam')),
  drop(
    'ProhibitedWordRule',
    'prohibited_word',
    'exceptAuthor',
    p.noteHas('prohibited_word'),
  ),
]

const ANCILLARY_DROP: RuleClause[] = [
  drop(
    'AncillaryDroppedRule',
    'ancillary_dropped',
    'exceptAuthor',
    p.ancillaryDropped,
  ),
]

/** ログアウト・未成年にはセンシティブを見せない */
const SENSITIVE_VIEWER_DROPS: RuleClause[] = [
  drop(
    'SensitiveViewerLoggedOutRule',
    'nsfw_for_viewer',
    'exceptAuthor',
    p.loggedOut,
    p.noteHas('nsfw_high_precision', 'gore_and_violence'),
  ),
  drop(
    'SensitiveViewerMinorRule',
    'nsfw_for_viewer',
    'exceptAuthor',
    p.minor,
    p.noteHas('nsfw_high_precision', 'nsfw_high_recall', 'gore_and_violence'),
  ),
]

/** 折りたたみ (CW 相当) */
const INTERSTITIALS: RuleClause[] = [
  interstitial(
    'WordMuteRule',
    'word_mute',
    'exceptAuthor',
    p.loggedIn,
    p.wordMuted,
  ),
  interstitial(
    'GoreInterstitialRule',
    'gore',
    'exceptAuthor',
    p.not(p.showsSensitive),
    p.noteHas('gore_and_violence'),
  ),
  interstitial(
    'NsfwLabelInterstitialRule',
    'nsfw',
    'exceptAuthor',
    p.not(p.showsSensitive),
    p.noteHas('nsfw_high_precision', 'nsfw_high_recall'),
  ),
  interstitial(
    'SensitiveFileInterstitialRule',
    'nsfw',
    'exceptAuthor',
    p.not(p.showsSensitive),
    p.hasSensitiveFile,
  ),
  interstitial(
    'NsfwAuthorInterstitialRule',
    'nsfw',
    'exceptAuthor',
    p.not(p.showsSensitive),
    p.hasMedia,
    p.authorHas('nsfw_high_precision'),
  ),
  interstitial(
    'SensitiveWordInterstitialRule',
    'sensitive_word',
    'exceptAuthor',
    p.noteHas('sensitive_word'),
  ),
]

/**
 * おすすめ (非フォロー相手からの流入: LTL / GTL / アンテナ / 検索など) でのみ効く drop。
 * x-algorithm の TimelineHomeRecommendations の additional_rules に相当する。
 */
const RECOMMENDATION_DROPS: RuleClause[] = [
  drop(
    'SilencedAuthorRecsRule',
    'author_silenced',
    'exceptAuthorAndFollowers',
    p.authorSilenced,
  ),
  drop(
    'SensitiveWordRecsRule',
    'possibly_undesirable',
    'exceptAuthorAndFollowers',
    p.noteHas('sensitive_word'),
  ),
  drop(
    'NsfwHighRecallRecsRule',
    'nsfw_for_viewer',
    'exceptAuthor',
    p.noteHas('nsfw_high_recall', 'nsfw_high_precision', 'gore_and_violence'),
  ),
  drop(
    'DoNotAmplifyRecsRule',
    'possibly_undesirable',
    'exceptAuthor',
    p.noteHas('do_not_amplify', 'malicious_url'),
  ),
  drop(
    'SpamHighRecallRecsRule',
    'possibly_undesirable',
    'exceptAuthor',
    p.noteHas('spam_high_recall', 'copypasta_spam', 'mention_spam'),
  ),
  drop(
    'AuthorLabelRecsRule',
    'possibly_undesirable',
    'exceptAuthor',
    p.authorHas(
      'nsfw_high_precision',
      'nsfw_high_recall',
      'nsfw_avatar_image',
      'nsfw_banner_image',
      'spam_high_recall',
      'compromised',
      'read_only',
      'impersonation',
    ),
  ),
  drop(
    'AbusiveAuthorRecsRule',
    'possibly_undesirable',
    'exceptAuthorAndFollowers',
    p.authorHas('abusive_high_recall', 'do_not_amplify'),
  ),
]

const HOME_TERMINALS = [
  ...AUTHOR_STATE_DROPS,
  ...SOCIALGRAPH_DROPS,
  ...NOTE_LABEL_DROPS,
  ...ANCILLARY_DROP,
  ...SENSITIVE_VIEWER_DROPS,
]

/** フォロー中の相手の投稿 (ホーム TL、ユーザーページ) */
export const HOME_POLICY: Policy = {
  name: 'home',
  rules: [...HOME_TERMINALS, ...INTERSTITIALS],
}

/** 非フォロー相手からの流入 (LTL / STL / GTL / アンテナ / 検索 / ハイライト) */
export const RECOMMENDATIONS_POLICY: Policy = {
  name: 'recommendations',
  rules: [...HOME_TERMINALS, ...RECOMMENDATION_DROPS, ...INTERSTITIALS],
}

/** モデレーター向け: 何も落とさず、折りたたみだけ返す */
export const MODERATOR_POLICY: Policy = {
  name: 'moderator',
  rules: [...INTERSTITIALS],
}

export type TimelineKind =
  | 'home'
  | 'user'
  | 'local'
  | 'social'
  | 'global'
  | 'antenna'
  | 'channel'
  | 'search'
  | 'explore'

/** Misskey のタイムライン種別からポリシーを選ぶ。social/user は関係で分ける */
export function policyForTimeline(
  kind: TimelineKind,
  viewerFollowsAuthor: boolean,
): Policy {
  switch (kind) {
    case 'home':
      return HOME_POLICY
    case 'user':
    case 'social':
      return viewerFollowsAuthor ? HOME_POLICY : RECOMMENDATIONS_POLICY
    default:
      return RECOMMENDATIONS_POLICY
  }
}

for (const policy of [HOME_POLICY, RECOMMENDATIONS_POLICY, MODERATOR_POLICY]) {
  const errors = validatePolicy(policy)
  if (errors.length > 0) {
    throw new Error(`invalid policy ${policy.name}: ${errors.join('; ')}`)
  }
}
