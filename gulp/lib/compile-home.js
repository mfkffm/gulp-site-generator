"use strict";

var gulp = require("gulp"),
    Promise = require("bluebird"),
    compileHandlebars = require("gulp-compile-handlebars"),
    rename = require("gulp-rename"),
    fs = require("fs"),
    path = require("path"),
    glob = require("glob"),
    moment = require("moment"),
    _ = require("lodash"),
    compileOptions = require("../lib/compile-options"),
    tags = require("../lib/tags"),
    dates = require("../lib/dates"),
    resolvePaths = require("../lib/paths"),
    compileDrafts = require("../lib/drafts"),
    promiseList = require("../lib/promises");

module.exports.run = function (rootPath, done, error) {
    var siteData = JSON.parse(fs.readFileSync(rootPath + "/site.json", "utf8"));
    var gulpVersion = require("gulp/package").version;
    var compileOptionsObj = compileOptions(rootPath);

    glob(rootPath + "/build/content/**/*.json", {
        cwd: rootPath
    }, function (err, files) {
        if (err) {
            error(err);
        } else {
            var posts = [],
                allPosts = [],
                pages = [];

            files.forEach(function (file) {
                var fileData = JSON.parse(fs.readFileSync(file, "utf8"));

                if (fileData.status && fileData.status === "draft" && !compileDrafts()) {
                    return;
                }

                // check and fill-in missing file meta data
                fileData = compileOptionsObj.checkContent(fileData);

                var metaData = {
                    title: fileData.title,
                    description: resolvePaths.resolve(fileData.body, "."),
                    url: "./" + fileData.slug + "/",
                    tagStr: fileData.tags,
                    tags: (fileData.tags ? tags.getTagsAsLinks(".", fileData.tags) : undefined),
                    date: fileData.date,
                    post_class: "post " + (fileData.template === "page.hbs" ? "page " : "") + (fileData.tags ? tags.getTagClasses(fileData.tags) : fileData.slug),
                    meta: fileData
                };

                if (fileData.date && fileData.template === "post.hbs") {
                    posts.push(metaData);
                } else {
                    pages.push(metaData);
                }
            });

            if (posts.length || pages.length) {
                posts.sort(dates.sortFunc);
                allPosts = _.cloneDeep(posts);

                var templateData = {
                    date: moment().format("YYYY-MM-DD"),
                    resourcePath: ".",
                    generator: "Gulp " + gulpVersion,
                    meta_title: siteData.title,
                    url: ".",
                    site: siteData,
                    posts: posts,
                    pages: pages,
                    body_class: "home-template",
                    rss: "." + siteData.rss,
                    allDates: dates.getAllDatesAsLinks(".", allPosts),
                    allTags: tags.getAllTagsAsLinks(".", allPosts)
                };

                var promises = [];

                if (siteData.maxItems && posts.length > siteData.maxItems) {
                    // how many pages do we need to create?
                    var totalPages = Math.ceil(posts.length / siteData.maxItems);

                    // shorten posts
                    var paginatedPosts = posts.splice(siteData.maxItems);

                    for (var i = 1; i < totalPages; i++) {
                        var pageNumber = i + 1;
                        var nextPosts = paginatedPosts.splice(0, siteData.maxItems);

                        // update the resource paths
                        nextPosts.forEach(function (post) {
                            post.description = resolvePaths.resolve(post.meta.body, "../..");
                            post.url = "../../" + post.meta.slug;
                        });

                        // create custom template data for this paginated page
                        var pageTemplateData = _.cloneDeep(templateData);
                        _.extend(pageTemplateData, {
                            posts: nextPosts,
                            resourcePath: "../..",
                            url: "../..",
                            rss: "../.." + siteData.rss,
                            allDates: dates.getAllDatesAsLinks("../..", allPosts),
                            allTags: tags.getAllTagsAsLinks("../..", allPosts)
                        });
                        delete pageTemplateData.pages;

                        // add pagination data
                        if (pageNumber === 2) {
                            pageTemplateData.prevUrl = "../../";
                        } else {
                            pageTemplateData.prevUrl = "../" + (pageNumber - 1);
                        }

                        if (pageNumber < totalPages) {
                            pageTemplateData.nextUrl = "../" + (pageNumber + 1);
                        }

                        pageTemplateData.totalPages = totalPages;

                        promises.push(new Promise(function (resolve, reject) {
                            gulp.src(rootPath + "/src/templates/index.hbs")
                                .pipe(compileHandlebars(pageTemplateData, compileOptionsObj))
                                .pipe(rename("index.html"))
                                .pipe(gulp.dest(rootPath + "/build/page/" + pageNumber))
                                .on("error", reject)
                                .on("end", function () {
                                    resolve();
                                });
                        }));
                    }

                    // update template
                    templateData.nextUrl = "./page/2";
                    templateData.totalPages = totalPages;
                }

                promises.unshift(new Promise(function (resolve, reject) {
                    gulp.src(rootPath + "/src/templates/index.hbs")
                        .pipe(compileHandlebars(templateData, compileOptionsObj))
                        .pipe(rename("index.html"))
                        .pipe(gulp.dest(rootPath + "/build"))
                        .on("error", reject)
                        .on("end", resolve);
                }));

                Promise.all(promiseList.filter(promises))
                    .then(function () {
                        done();
                    }, function (err) {
                        error(err);
                    });
            } else {
                done();
            }
        }
    });
};
