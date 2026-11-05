package com.vmd.automation;

import static io.cucumber.junit.platform.engine.Constants.GLUE_PROPERTY_NAME;

import org.junit.platform.suite.api.ConfigurationParameter;
import org.junit.platform.suite.api.IncludeEngines;
import org.junit.platform.suite.api.SelectClasspathResource;
import org.junit.platform.suite.api.Suite;

/**
 * Single Cucumber entry point. Pick what to run with a tag expression:
 *
 *   mvn test -Dcucumber.filter.tags="@api"
 *   mvn test -Dcucumber.filter.tags="@ui"
 *   mvn test -Dcucumber.filter.tags="@api and @smoke"
 */
@Suite
@IncludeEngines("cucumber")
@SelectClasspathResource("features")
@ConfigurationParameter(key = GLUE_PROPERTY_NAME, value = "com.vmd.automation")
public class RunCucumberTest {
}
