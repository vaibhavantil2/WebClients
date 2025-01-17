import { c } from 'ttag';

import { ACCENT_COLORNAMES } from '@proton/shared/lib/constants';

import { SpamItem, SpamListAction, SpamListActionName, SpamLocation } from './Spams.interfaces';

export const isSpamDomain = (item: SpamItem) => 'domain' in item;
export const isSpamEmail = (item: SpamItem) => 'email' in item;

type ApiCallState = 'success' | 'fail';
export const getNotificationByAction = (action: SpamListActionName, apiCallstate: ApiCallState, item: SpamItem) => {
    const isDomain = 'domain' in item;
    const name = isDomain ? item.domain : item.email;

    const translationsMap: Record<SpamListActionName, Record<ApiCallState, string>> = {
        block: {
            fail: isDomain
                ? c('Domain spam notification').t`${name} failed to move to your block list`
                : c('Email spam notification').t`${name} failed to move to your block list`,
            success: isDomain
                ? c('Domain spam notification').t`${name} moved to your block list`
                : c('Email spam notification').t`${name} moved to your block list`,
        },
        delete: {
            fail: isDomain
                ? c('Domain spam notification').t`${name} deletion failed`
                : c('Email spam notification').t`${name} deletion failed`,
            success: isDomain
                ? c('Domain spam notification').t`${name} successfully deleted`
                : c('Email spam notification').t`${name} successfully deleted`,
        },
        unblock: {
            fail: isDomain
                ? c('Domain spam notification').t`${name} deletion failed`
                : c('Email spam notification').t`${name} deletion failed`,
            success: isDomain
                ? c('Domain spam notification').t`${name} successfully deleted`
                : c('Email spam notification').t`${name} successfully deleted`,
        },
        spam: {
            fail: isDomain
                ? c('Domain spam notification').t`${name} failed to move to spam list`
                : c('Email spam notification').t`${name} failed to move to spam list`,
            success: isDomain
                ? c('Domain spam notification').t`${name} moved to spam list`
                : c('Email spam notification').t`${name} moved to spam list`,
        },
        unspam: {
            fail: isDomain
                ? c('Domain spam notification').t`${name} failed to move to not spam List`
                : c('Email spam notification').t`${name} failed to move to not spam List`,
            success: isDomain
                ? c('Domain spam notification').t`${name} moved to not spam list`
                : c('Email spam notification').t`${name} moved to not spam list`,
        },
    };

    return translationsMap[action][apiCallstate];
};

export type HandleSpamListActionClick = (type: SpamListActionName, item: SpamItem) => void;
export const getActionsByLocation = (
    item: SpamItem,
    onClick: HandleSpamListActionClick,
    blockSenderFeatureEnabled: boolean
): SpamListAction[] => {
    const actions: Record<SpamListActionName, SpamListAction> = {
        block: { name: c('Action').t`Block`, onClick: () => onClick('block', item) },
        unblock: { name: c('Action').t`Remove Block`, onClick: () => onClick('delete', item) },
        delete: { name: c('Action').t`Delete`, onClick: () => onClick('delete', item) },
        spam: { name: c('Action').t`Mark as spam`, onClick: () => onClick('spam', item) },
        unspam: { name: c('Action').t`Mark as not spam`, onClick: () => onClick('unspam', item) },
    };

    switch (item.location) {
        case 'BLOCKED':
            return [actions.unblock, actions.spam];
        case 'SPAM':
            return [actions.unspam, ...(blockSenderFeatureEnabled ? [actions.block] : []), actions.delete];
        case 'NON_SPAM':
            return [actions.spam, ...(blockSenderFeatureEnabled ? [actions.block] : []), actions.delete];
        default:
            throw new Error('Invalid use case');
    }
};

export const getLabelByLocation = (location: SpamLocation): { name: string; color: string } => {
    switch (location) {
        case 'BLOCKED':
            return { name: c('Label').t`Blocked`, color: ACCENT_COLORNAMES.strawberry.color };
        case 'NON_SPAM':
            return { name: c('Label').t`Not spam`, color: ACCENT_COLORNAMES.reef.color };
        case 'SPAM':
            return { name: c('Label').t`Spam`, color: ACCENT_COLORNAMES.carrot.color };
        default:
            throw new Error('Invalid use case');
    }
};
