'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rp = require('request-promise');
const template = require('./template');
const url = require('url');

const articles = "http://www.hipwee.com/terbaru"; // recent articles 

//Remove elements
const remove_elements = [
    'banner', //ads
    'iframe', //delete iframes
    'noscript', //any script injection
    'script', //any script injection
    'video',
    '.helpful-article', //recomendation articles 
    '.single-share', //Share buttons
    '.wp-video',
];

//Remove img metadata
const remove_metadata = [
    'class',
    'data-src',
    'height',
    'id',
    'sizes',
    'src',
    'width',
];

function ingest_article_profile(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        const asset = new libingester.NewsArticle();

        asset.set_canonical_uri(uri);

        // Pull out the updated date
        const modified_date = new Date(); //articles doesn´t have date modified 
        asset.set_last_modified_date(modified_date);

        const section = $profile('meta[property="article:section"]').attr('content');
        asset.set_section(section);

        //Set title section
        const title = $profile('meta[name="title"]').attr('content');
        const description = $profile('meta[name="description"]').attr('content');
        const author = $profile('meta[name="author"]').attr('content');
        asset.set_title(title);
        asset.set_synopsis(description);

        // Pull out the main image
        let main_img = $profile('.post-image img').first();
        const main_image = libingester.util.download_img(main_img, base_uri);
        const image_credit = $profile('.image-credit').children();
        main_image.set_title(title);
        hatch.save_asset(main_image);
        asset.set_thumbnail(main_image);

        const body = $profile('.post-content').first();

        //remove elements
        for (const remove_element of remove_elements) {
            body.find(remove_element).remove();
        }

        const post_tags = $profile('.article-tag').children();

        //Download images 
        body.find("img").map(function() {
            if (this.attribs.src || this.attribs["data-src"]) {
                const image = libingester.util.download_img(this, base_uri);
                image.set_title(title);
                hatch.save_asset(image);
                this.attribs["data-libingester-asset-id"] = image.asset_id;
                for (const meta of remove_metadata) {
                    delete this.attribs[meta];
                }
            }
        });

        const content = mustache.render(template.structure_template, {
            title: title,
            author: author,
            category: section,
            main_image: main_image,
            image_credit: image_credit,
            body: body.html(),
            post_tags: post_tags,
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    libingester.util.fetch_html(articles).then(($pages) => {
        const articles_links = $pages('.archive-post .archive-base .post-title a:first-of-type').map(function() {
            const uri = $pages(this).attr('href');
            return url.resolve(articles, uri);
        }).get();

        Promise.all(articles_links.map((uri) => ingest_article_profile(hatch, uri))).then(() => {
            return hatch.finish();
        });
    });
}

main();