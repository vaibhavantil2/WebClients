import { act, fireEvent } from '@testing-library/react';
import { wait } from '@proton/shared/lib/helpers/promise';
import { EOClearAll, EOSubject } from '../../../../helpers/test/eo/helpers';
import { setup } from './EOReply.test.helpers';
import { tick } from '../../../../helpers/test/render';

describe('EO Reply attachments', () => {
    afterEach(EOClearAll);

    const fileName = 'file.txt';
    const fileType = 'text/plain';
    const fileContent = 'File content';
    const blob = new Blob([fileContent], { type: fileType });
    const file = new File([blob], fileName, { type: fileType });

    it('should add attachments to a EO message and be able to preview them', async () => {
        const { getByText, getByTestId } = await setup();

        getByText(EOSubject);

        const inputAttachment = getByTestId('composer-attachments-button') as HTMLInputElement;
        await act(async () => {
            fireEvent.change(inputAttachment, { target: { files: [file] } });
            await wait(100);
        });

        const toggleList = getByTestId('attachment-list-toggle');
        fireEvent.click(toggleList);

        await tick();

        const item = getByTestId('attachment-item').querySelectorAll('button')[1];

        fireEvent.click(item);
        await tick();

        const preview = document.querySelector('.file-preview');

        expect(preview).toBeDefined();
        expect(preview?.textContent).toMatch(new RegExp(fileName));
        getByText(fileContent);
    });
});