import { useHistory } from 'react-router';
import { encryptMessage, OpenPGPKey } from 'pmcrypto';
import { c } from 'ttag';

import { useApi, useNotifications } from '@proton/components';
import { EOReply } from '@proton/shared/lib/api/eo';
import { blobURLtoBlob } from '@proton/shared/lib/helpers/file';
import { wait } from '@proton/shared/lib/helpers/promise';

import { MessageKeys, MessageState } from '../../logic/messages/messagesTypes';
import { prepareExport } from '../../helpers/message/messageExport';
import { createBlob, readContentIDandLocation } from '../../helpers/message/messageEmbeddeds';
import { getDecryptedAttachment } from '../../helpers/attachment/attachmentLoader';
import { encryptFile } from '../../helpers/attachment/attachmentUploader';
import SendingMessageNotification, {
    createSendingMessageNotificationManager,
} from '../../components/notifications/SendingMessageNotification';
import { EO_MESSAGE_REDIRECT_PATH, MIN_DELAY_SENT_NOTIFICATION } from '../../constants';

interface EOAttachment {
    Filename: string[];
    DataPacket: Blob[];
    KeyPackets: Blob[];
    ContentID: string[];
    MIMEType: string[];
}

interface Props {
    message: MessageState;
    publicKeys?: OpenPGPKey[];
    outsideKey?: MessageKeys;
}

export const useSendEO = ({ message, publicKeys, outsideKey }: Props) => {
    const api = useApi();
    const history = useHistory();
    const notifManager = createSendingMessageNotificationManager();
    const { createNotification, hideNotification } = useNotifications();

    let password = '';
    let decryptedToken = '';
    let id = '';

    if (outsideKey?.type === 'outside') {
        password = outsideKey.password;
        decryptedToken = outsideKey.decryptedToken;
        id = outsideKey.id;
    }

    const send = async () => {
        notifManager.ID = createNotification({
            text: <SendingMessageNotification manager={notifManager} />,
            expiration: -1,
            disableAutoClose: true,
        });

        try {
            const replyContent = prepareExport(message);

            const Body = (await encryptMessage({ data: replyContent, publicKeys })).data;

            const ReplyBody = (await encryptMessage({ data: replyContent, passwords: [password] })).data;

            const Packages = {
                Filename: [],
                DataPacket: [],
                KeyPackets: [],
                ContentID: [],
                MIMEType: [],
            } as EOAttachment;

            for (const attachment of message.data?.Attachments || []) {
                const { cid } = readContentIDandLocation(attachment);

                if (cid !== '') {
                    Packages.ContentID.push(cid);
                }

                Packages.Filename.push(attachment.Name || '');
                Packages.MIMEType.push(attachment.MIMEType || '');

                /** Uploaded attachments during reply composition already contains Data and KeyPackets.
                 *  However, we do not have these data for embedded images in the original message, which are in the reply blockquotes
                 *  We need to get original message embedded images data in order to build KeyPackets and DataPacket before sending
                 */
                if (!attachment.DataPacket && publicKeys && outsideKey) {
                    // Inline images from original message
                    try {
                        /** To get Data and Key packets, we need to :
                         *  - Get attachments data from BE to build the blob URL
                         *  - Create the actual blob from the blob URL
                         *  - Encrypt the blob to get the packets which contains Data and Key packets
                         */
                        await getDecryptedAttachment(attachment, undefined, outsideKey, api)
                            .then((decryptedAttachment) => {
                                const blobURL = createBlob(attachment, decryptedAttachment.data as Uint8Array);
                                return blobURLtoBlob(blobURL) as Promise<Blob>;
                            })
                            .then((blob: Blob) => {
                                return encryptFile(blob as File, true, publicKeys);
                            })
                            .then((packet) => {
                                Packages.DataPacket.push(new Blob([packet.data]));
                                Packages.KeyPackets.push(new Blob([packet.keys]));
                            });
                    } catch (e: any) {
                        console.error(e);
                    }
                } else if (attachment.DataPacket) {
                    // Attachments from EO message to send
                    Packages.DataPacket.push(attachment.DataPacket);
                    Packages.KeyPackets.push(attachment.KeyPackets);
                }
            }

            const data = {
                Body,
                ReplyBody,
                'Filename[]': Packages ? Packages.Filename : [],
                'MIMEType[]': Packages ? Packages.MIMEType : [],
                'ContentID[]': Packages ? Packages.ContentID : [],
                'KeyPackets[]': Packages ? Packages.KeyPackets : [],
                'DataPacket[]': Packages ? Packages.DataPacket : [],
            };

            const promise = api(EOReply(decryptedToken || '', id, data));

            notifManager.setProperties(promise);

            await promise;
            history.push(`${EO_MESSAGE_REDIRECT_PATH}/${id}`);

            await wait(MIN_DELAY_SENT_NOTIFICATION);
            hideNotification(notifManager.ID);
        } catch (error: any) {
            hideNotification(notifManager.ID);

            createNotification({
                type: 'error',
                text: c('Error').t`Error while sending the message. Message is not sent.`,
            });

            console.error('Error while sending the message.', error);
            throw error;
        }
    };

    return { send };
};
