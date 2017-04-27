'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rp = require('request-promise');
const template = require('./template');
const url = require('url');

const home_page = 'https://www.wowshack.com/'; // Home section

//Remove elements
const remove_elements = [
    'form', //Newsletter
    'ins', //Ads
    'noscript', //any script injection
    'script', //any script injection
    '.addthis_responsive_sharing', //sharing buttons
    '.code-block', //recomendation links
    '.embed-block-wrapper', //Image wrapper
    '.fb-comments', //comments
    '.image-block-outer-wrapper', //Image wrapper
    '.intrinsic',
    '.newsletter-form-field-wrapper', //Newsletter
    '.newsletter-form-header-title', //Newsletter
    '.newsletter-form-wrapper', //Newsletter
    '.sqs-block-code', // Ads
    '#taboola-below-article-thumbnails', //Related articles
];

const remove_metadata = [
    'data-image',
    'data-image-id',
    'data-src',
    'href',
    'src',
];

function ingest_article_profile(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        const asset = new libingester.NewsArticle();

        asset.set_canonical_uri(uri);
        // Pull out the updated date
        const modified_date = new Date(Date.parse($profile('.date time').attr('datetime')));
        asset.set_last_modified_date(modified_date);
        asset.set_section("Article");

        //Set title section
        const title = $profile('meta[property="og:title"]').attr('content');
        const date = $profile('.date time').first().text();
        asset.set_title(title);

        //Delete image wrapper
        $profile('.image-block-outer-wrapper').map(function() {
            const parent = $profile(this);
            parent.find("img.thumb-image, .image-caption").map(function() {
                const child = $profile(this);
                parent.before(child);
            });
        });

        //remove elements
        const layout = $profile('#canvas').first();
        for (const remove_element of remove_elements) {
            layout.find(remove_element).remove();
        }

        let article_content = $profile('.sqs-block-content');
        //cleaning html use p in paragraphs 
        article_content.find("h3").map(function() {
            this.name = "p";
        });

        //Download images 
        article_content.find("img").map(function() {
            if (this.attribs.src == undefined) {
                this.attribs.src = this.attribs['data-src'];
            }
            const image = libingester.util.download_img(this, base_uri);
            hatch.save_asset(image);
            this.attribs["data-libingester-asset-id"] = image.asset_id;
            for (const meta of remove_metadata) {
                delete this.attribs[meta];
            }
        });

        //Download videos 
        const videos = $profile(".sqs-block-video").map(function() {
            const json_video_info = JSON.parse(this.attribs["data-block-json"]);
            if (json_video_info.url != undefined) {
                const video_asset = new libingester.VideoAsset();
                video_asset.set_canonical_uri(uri);
                video_asset.set_last_modified_date(modified_date);
                video_asset.set_title(title);
                video_asset.set_download_uri(json_video_info.url);
                hatch.save_asset(video_asset);
            }
        });

        const body = article_content.map(function() {
            return $profile(this).html();
        }).get();

        const content = mustache.render(template.structure_template, {
            title: title,
            date: date,
            html: body.join(''),
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    libingester.util.fetch_html(home_page).then(($pages) => {
        const articles_links = $pages('#page a.project:nth-child(-n + 30)').map(function() {
            const uri = $pages(this).attr('href');
            return url.resolve(home_page, uri);
        }).get();

        Promise.all(articles_links.map((uri) => ingest_article_profile(hatch, uri))).then(() => {
            return hatch.finish();
        });
    });
}

main();