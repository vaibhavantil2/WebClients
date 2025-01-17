import { c } from 'ttag';

import { updateCalendarUserSettings } from '@proton/shared/lib/api/calendars';
import { CalendarUserSettings } from '@proton/shared/lib/interfaces/calendar';

import { Toggle } from '../../../components';
import { ToggleProps } from '../../../components/toggle/Toggle';
import { useApi, useEventManager, useLoading, useNotifications } from '../../../hooks';

interface Props extends ToggleProps {
    calendarUserSettings: CalendarUserSettings;
    reverse?: boolean;
}

const AutoDetectPrimaryTimezoneToggle = ({
    calendarUserSettings: { AutoDetectPrimaryTimezone },
    reverse = false,
    ref,
    ...rest
}: Props) => {
    const api = useApi();
    const { call } = useEventManager();
    const { createNotification } = useNotifications();
    const [loadingAutoDetect, withLoadingAutoDetect] = useLoading();
    const checked = reverse ? !AutoDetectPrimaryTimezone : !!AutoDetectPrimaryTimezone;

    const handleChange = async (data: Partial<CalendarUserSettings>) => {
        await api(updateCalendarUserSettings(data));
        await call();
        createNotification({ text: c('Success').t`Preference saved` });
    };

    return (
        <Toggle
            {...rest}
            id="autodetect-primary-timezone"
            aria-describedby="autodetect-primary-timezone"
            loading={loadingAutoDetect}
            checked={checked}
            onChange={({ target }) =>
                withLoadingAutoDetect(
                    handleChange({
                        AutoDetectPrimaryTimezone: reverse ? +!target.checked : +target.checked,
                    })
                )
            }
        />
    );
};

export default AutoDetectPrimaryTimezoneToggle;
