import { useEffect } from 'react';
import { c } from 'ttag';
import { useHistory } from 'react-router-dom';
import { Button, Icon } from '@proton/components';
import { MAILBOX_LABEL_IDS } from '@proton/shared/lib/constants';

import { useLocationFieldOptions } from './useLocationFieldOptions';
import LocationFieldDropdown from './LocationFieldDropdown';

interface Props {
    value: string;
    onChange: (nextValue: string) => void;
}

const { INBOX, ALL_MAIL, SENT, DRAFTS, ALL_SENT, ALL_DRAFTS } = MAILBOX_LABEL_IDS;
const LOCATION_FIELD_MAIN_OPTIONS: string[] = [ALL_MAIL, INBOX, DRAFTS, SENT, ALL_SENT, ALL_DRAFTS];

const LocationField = ({ value, onChange }: Props) => {
    const { all: options, isDefaultFolder } = useLocationFieldOptions();
    const history = useHistory();
    const firstOptions = options.filter(({ value }) => LOCATION_FIELD_MAIN_OPTIONS.includes(value));
    const { findItemByValue } = useLocationFieldOptions();

    const isCustomValue =
        value !== undefined && LOCATION_FIELD_MAIN_OPTIONS.every((optionValue) => optionValue !== value);
    const customValueText = isCustomValue ? findItemByValue(value)?.text : undefined;
    const showCustomValue = isCustomValue === true && customValueText !== undefined;

    useEffect(() => {
        const selectedValueFromUrl = options.reduce((acc, option) => {
            if (isDefaultFolder(option) && history.location.pathname.includes(option.url)) {
                return option.value;
            }
            return acc;
        }, value);

        window.setTimeout(() => onChange(selectedValueFromUrl), 0);
    }, []);

    return (
        <>
            <span className="block text-semibold mb0-5">{c('Label').t`Search in`}</span>
            <div className="flex flex-wrap flex-align-items-start mb0-5 flex-gap-0-5">
                {firstOptions.map((option) => (
                    <Button
                        key={option.value}
                        data-testid={`location-${option.value}`}
                        onClick={() => {
                            onChange(option.value);
                        }}
                        color={value === option.value ? 'norm' : 'weak'}
                        shape="solid"
                        size="small"
                        title={
                            // translator: The full sentence is "Search in All mail/Inbox/Drafts/etc." (only for blind users)
                            c('Action').t`Search in ${option.text}`
                        }
                    >
                        {option.text}
                    </Button>
                ))}
                <LocationFieldDropdown onChange={onChange} value={value} />
                {showCustomValue ? (
                    <Button
                        className="flex flex-nowrap flex-align-items-center"
                        onClick={() => onChange(ALL_MAIL)}
                        color="norm"
                        shape="solid"
                        size="small"
                        title={c('Action').t`Remove`}
                    >
                        <span className="text-ellipsis">{customValueText}</span>
                        <Icon name="xmark" className="ml0-5 flex-item-noshrink" size={12} />
                    </Button>
                ) : null}
            </div>
        </>
    );
};

export default LocationField;