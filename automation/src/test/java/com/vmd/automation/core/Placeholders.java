package com.vmd.automation.core;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Expands {@code ${...}} tokens in paths and JSON bodies so feature files stay free of ids and dates.
 * <pre>
 *   ${brand.id}            field of an entity remembered earlier (dotted path into the stored JSON)
 *   ${unique}              a fresh E2E-... token        ${unique:a}  the same token every time within a scenario
 *   ${today} ${today+7}    India-time dates (yyyy-MM-dd) ${today-30}
 *   ${repeat:501}          501 characters, for length-limit checks
 * </pre>
 */
public final class Placeholders {

    private static final Pattern TOKEN = Pattern.compile("\\$\\{([^}]+)}");
    private static final Pattern DATE = Pattern.compile("today(?:([+-])(\\d+))?");
    private static final AtomicInteger SEQ = new AtomicInteger();

    private Placeholders() {}

    public static String unique() {
        return "E2E-" + Long.toString(System.currentTimeMillis(), 36).toUpperCase() + "-" + SEQ.incrementAndGet();
    }

    public static String resolve(String text, Map<String, Object> variables) {
        Matcher m = TOKEN.matcher(text);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            m.appendReplacement(out, Matcher.quoteReplacement(valueOf(m.group(1).trim(), variables)));
        }
        m.appendTail(out);
        return out.toString();
    }

    private static String valueOf(String key, Map<String, Object> variables) {
        if (key.equals("unique")) return unique();
        if (key.startsWith("unique:")) {
            return String.valueOf(variables.computeIfAbsent("unique:" + key.substring(7), k -> unique()));
        }
        if (key.startsWith("repeat:")) return "x".repeat(Integer.parseInt(key.substring(7)));
        Matcher date = DATE.matcher(key);
        if (date.matches()) {
            long days = date.group(2) == null ? 0 : Long.parseLong(date.group(2));
            LocalDate d = "-".equals(date.group(1)) ? Dates.todayIstPlusDays(-days) : Dates.todayIstPlusDays(days);
            return d.toString();
        }
        String[] path = key.split("\\.");
        Object current = variables.get(path[0]);
        for (int i = 1; i < path.length && current != null; i++) {
            current = step(current, path[i]);
        }
        if (current == null) throw new IllegalStateException("No value for ${" + key + "} - was it remembered earlier in the scenario?");
        return String.valueOf(current);
    }

    private static Object step(Object node, String segment) {
        if (node instanceof Map<?, ?> map) return map.get(segment);
        if (node instanceof List<?> list && segment.matches("\\d+")) return list.get(Integer.parseInt(segment));
        return null;
    }
}
