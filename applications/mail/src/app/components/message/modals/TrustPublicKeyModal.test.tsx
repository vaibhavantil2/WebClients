import { OpenPGPKey } from 'pmcrypto';
import { fireEvent } from '@testing-library/dom';
import { ContactWithBePinnedPublicKey } from '@proton/shared/lib/interfaces/contacts';
import { addKeysToUserKeysCache, GeneratedKey, generateKeys } from '../../../helpers/test/crypto';
import TrustPublicKeyModal from './TrustPublicKeyModal';
import { render, tick } from '../../../helpers/test/render';
import { addApiMock } from '../../../helpers/test/api';
import { clearAll, waitForNotification } from '../../../helpers/test/helper';
import { receiver, sender, setupContactsForPinKeys } from '../../../helpers/test/pinKeys';

const senderAddress = 'sender@outside.com';

const getContact = (senderKey: OpenPGPKey, isContact = false) => {
    return {
        emailAddress: senderAddress,
        name: 'Sender',
        contactID: isContact ? 'contactID' : undefined,
        isInternal: false,
        bePinnedPublicKey: senderKey,
    } as ContactWithBePinnedPublicKey;
};

describe('Trust public key modal', () => {
    afterEach(clearAll);

    const setup = async (senderKeys: GeneratedKey, isContact: boolean) => {
        const contact = getContact(senderKeys.publicKeys[0], isContact);

        const component = await render(<TrustPublicKeyModal contact={contact} open />);

        return component;
    };

    it('should update contact when trusting key if contact already exists', async () => {
        // Create the contact
        const { senderKeys, receiverKeys, updateSpy } = await setupContactsForPinKeys();

        addKeysToUserKeysCache(receiverKeys);

        const { getByText, getByTestId } = await setup(senderKeys, true);

        // Modal is displayed
        getByText('Trust public key?');

        // Click on Trust key button
        const submitButton = getByTestId('trust-key-modal:submit');
        fireEvent.click(submitButton);
        await tick();

        // Contact has been updated
        expect(updateSpy).toHaveBeenCalled();
    });

    it('should create a contact when trusting key if contact does not exists', async () => {
        const senderKeys = await generateKeys('sender', sender.Address);
        const receiverKeys = await generateKeys('me', receiver.Address);

        addKeysToUserKeysCache(receiverKeys);

        const createSpy = jest.fn(() => {
            return {
                Responses: [
                    {
                        Response: { Code: 1000 },
                    },
                ],
            };
        });
        addApiMock('contacts/v4/contacts', createSpy, 'post');

        const { getByText, getByTestId } = await setup(senderKeys, false);

        // Modal is displayed
        getByText('Trust public key?');

        // Click on Trust key button
        const submitButton = getByTestId('trust-key-modal:submit');
        fireEvent.click(submitButton);
        await tick();

        // Contact has been created
        expect(createSpy).toHaveBeenCalled();
    });

    it('should display a notification when key could not be trusted', async () => {
        const senderKeys = await generateKeys('sender', sender.Address);
        const receiverKeys = await generateKeys('me', receiver.Address);

        addKeysToUserKeysCache(receiverKeys);

        const createSpy = jest.fn(() => {
            return {
                Responses: [
                    {
                        Response: { Code: 1002 }, // Wrong api code to trigger the error
                    },
                ],
            };
        });
        addApiMock('contacts/v4/contacts', createSpy, 'post');

        const { getByText, getByTestId } = await setup(senderKeys, false);

        // Modal is displayed
        getByText('Trust public key?');

        // Click on Trust key button
        const submitButton = getByTestId('trust-key-modal:submit');
        fireEvent.click(submitButton);
        await tick();

        // Contact has been created
        expect(createSpy).toHaveBeenCalled();

        await waitForNotification('Public key could not be trusted');
    });
});