import { INCOMING_DEFAULTS_LOCATION } from '@proton/shared/lib/constants';
import { Address, IncomingDefault } from '@proton/shared/lib/interfaces';
import { Recipient } from '@proton/shared/lib/interfaces/Address';
import { ContactGroup } from '@proton/shared/lib/interfaces/contacts';
import { Message } from '@proton/shared/lib/interfaces/mail/Message';

import { Conversation } from '../models/conversation';
import { Element } from '../models/element';
import {
    findSender,
    getNumParticipants,
    getRecipientGroupLabel,
    getRecipientLabel,
    getSendersToBlock,
    recipientsToRecipientOrGroup,
} from './addresses';

const recipient1: Recipient = { Name: '', Address: 'address1' };
const recipient2: Recipient = { Name: 'recipient2', Address: 'address2' };
const recipient3: Recipient = { Name: 'recipient3', Address: 'address3', Group: 'Group1' };
const recipient4: Recipient = { Name: 'recipient4', Address: 'address4', Group: 'Group1' };
const recipient5: Recipient = { Name: 'recipient5', Address: 'address5', Group: 'Group2' };
const group1 = { ID: 'GroupID1', Name: 'GroupName1', Path: 'Group1' } as ContactGroup;
const groupMap = { [group1.Path]: group1 };

describe('addresses', () => {
    describe('findSender', () => {
        it('should return empty for no message no addresses', () => {
            const result = findSender();
            expect(result).toBe(undefined);
        });

        it('should return empty for no addresses', () => {
            const result = findSender([], { AddressID: '1' } as Message);
            expect(result).toBe(undefined);
        });

        it('should return empty if no match', () => {
            const result = findSender([{ Status: 2 }] as Address[], { AddressID: '1' } as Message);
            expect(result).toBe(undefined);
        });

        it('should return first if addresses valid but no match', () => {
            const first = { Status: 1, Order: 1, ID: '2' };
            const result = findSender(
                [{ Status: 2 }, first, { Status: 1, Order: 2, ID: '3' }] as Address[],
                {
                    AddressID: '1',
                } as Message
            );
            expect(result).toBe(first);
        });

        it('should return first if addresses order valid but no match', () => {
            const first = { Status: 1, Order: 1, ID: '2' };
            const result = findSender(
                [{ Status: 2, Order: 0, ID: '1' }, first, { Status: 1, Order: 2, ID: '3' }] as Address[],
                {
                    AddressID: '1',
                } as Message
            );
            expect(result).toEqual(first);
        });

        it('should return the match over order', () => {
            const match = { Status: 1, Order: 2, ID: '1' };
            const result = findSender(
                [{ Status: 2 }, match, { Status: 1, Order: 1, ID: '2' }] as Address[],
                {
                    AddressID: '1',
                } as Message
            );
            expect(result).toBe(match);
        });
    });

    describe('recipientsToRecipientOrGroup', () => {
        it('should return recipients if no group', () => {
            const result = recipientsToRecipientOrGroup([recipient1, recipient2], {});
            expect(result).toEqual([{ recipient: recipient1 }, { recipient: recipient2 }]);
        });

        it('should merge recipients from a group', () => {
            const result = recipientsToRecipientOrGroup([recipient3, recipient4], groupMap);
            expect(result).toEqual([{ group: { group: group1, recipients: [recipient3, recipient4] } }]);
        });

        it('should split recipients from group and those not', () => {
            const result = recipientsToRecipientOrGroup([recipient2, recipient3], groupMap);
            expect(result).toEqual([{ recipient: recipient2 }, { group: { group: group1, recipients: [recipient3] } }]);
        });

        it('should give up group from recipient if not in group list', () => {
            const result = recipientsToRecipientOrGroup([recipient5], groupMap);
            expect(result).toEqual([{ recipient: recipient5 }]);
        });
    });

    describe('getRecipientOrGroupLabel', () => {
        it('should return recipient address if it has no name', () => {
            const result = getRecipientLabel(recipient1, {});
            expect(result).toEqual('address1');
        });

        it('should return recipient name if it exists', () => {
            const result = getRecipientLabel(recipient2, {});
            expect(result).toEqual('recipient2');
        });

        it('should return group label', () => {
            const result = getRecipientGroupLabel({ group: group1, recipients: [] }, 0);
            expect(result).toEqual('GroupName1 (0/0 members)');
        });

        it('should compute group size with contact list', () => {
            const result = getRecipientGroupLabel({ group: group1, recipients: [recipient3, recipient4] }, 8);
            expect(result).toEqual('GroupName1 (2/8 members)');
        });
    });

    describe('getNumParticipants', () => {
        it('should not count same participant', () => {
            const sender: Recipient = { Name: 'Panda', Address: 'panda@pm.me' };
            const recipient1: Recipient = { Name: 'Panda', Address: 'panda@pm.me' };
            const recipient2: Recipient = { Name: 'Panda', Address: 'p.an.da@pm.me' };
            const recipient3: Recipient = { Name: 'Panda', Address: 'panda+panda@pm.me' };
            const conversation: Element = {
                ID: 'conversationID',
                Senders: [sender],
                Recipients: [recipient1, recipient2, recipient3],
            };
            const result = getNumParticipants(conversation);
            expect(result).toEqual(1);
        });
    });

    describe('getSendersToBlock', () => {
        // Message not present in SPAM or ALLOW or BLOCK list
        const toCreate = 'toCreate@protonmail.com';
        // Message from someone already in the SPAM list
        const toUpdateSpam = 'toUpdateSpam@protonmail.com';
        // Message from someone already in the ALLOW list
        const toUpdateInbox = 'toUpdateInbox@protonmail.com';
        // Message from someone already in the BLOCK list
        const alreadyBlocked = 'alreadyBlocked@protonmail.com';
        // Message sent to myself
        const me = 'me@protonmail.com';
        // Message sent to myself from secondary address
        const me2 = 'me2@protonmail.com';

        const incomingDefaultsAddresses = [
            { ID: '1', Email: toUpdateInbox, Location: INCOMING_DEFAULTS_LOCATION.INBOX } as IncomingDefault,
            { ID: '2', Email: toUpdateSpam, Location: INCOMING_DEFAULTS_LOCATION.SPAM } as IncomingDefault,
            { ID: '3', Email: alreadyBlocked, Location: INCOMING_DEFAULTS_LOCATION.BLOCKED } as IncomingDefault,
        ] as IncomingDefault[];

        const addresses = [{ Email: me } as Address, { Email: me2 } as Address] as Address[];

        const expectedSenders = [
            { Address: toCreate } as Recipient,
            { Address: toUpdateSpam } as Recipient,
            { Address: toUpdateInbox } as Recipient,
        ];

        it('should return expected senders to block from messages', () => {
            const elements = [
                { Sender: { Address: toCreate } as Recipient, ConversationID: '1' } as Message,
                { Sender: { Address: toUpdateSpam } as Recipient, ConversationID: '2' } as Message,
                { Sender: { Address: toUpdateInbox } as Recipient, ConversationID: '3' } as Message,
                // Put one 2 times to check that it will not be called 2 times
                { Sender: { Address: toUpdateInbox } as Recipient, ConversationID: '4' } as Message,
                { Sender: { Address: alreadyBlocked } as Recipient, ConversationID: '5' } as Message,
                { Sender: { Address: me } as Recipient, ConversationID: '6' } as Message,
                { Sender: { Address: me2 } as Recipient, ConversationID: '7' } as Message,
            ] as Element[];

            const senders = getSendersToBlock(elements, incomingDefaultsAddresses, addresses);

            expect(senders).toEqual(expectedSenders);
        });

        it('should return expected senders to block from conversation', () => {
            const elements = [
                { Senders: [{ Address: toCreate } as Recipient] } as Conversation,
                { Senders: [{ Address: toUpdateSpam } as Recipient] } as Conversation,
                { Senders: [{ Address: toUpdateInbox } as Recipient] } as Conversation,
                // Put one 2 times to check that it will not be called 2 times
                { Senders: [{ Address: toUpdateInbox } as Recipient] } as Conversation,
                { Senders: [{ Address: alreadyBlocked } as Recipient] } as Conversation,
                { Senders: [{ Address: me } as Recipient] } as Conversation,
                { Senders: [{ Address: me2 } as Recipient] } as Conversation,
            ] as Element[];

            const senders = getSendersToBlock(elements, incomingDefaultsAddresses, addresses);

            expect(senders).toEqual(expectedSenders);
        });
    });
});
