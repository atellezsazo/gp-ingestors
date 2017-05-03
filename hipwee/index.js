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

//embedded content
const video_iframes = [
    'youtube', //YouTube
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
        const title = $profile('meta[property="og:title"]').attr('content');
        const article_entry = $profile('.article-entry').first().children();
        asset.set_title(title);

        // Pull out the main image
        let main_img = $profile('.post-image img').first();
        const main_image = libingester.util.download_img(main_img, base_uri);
        const image_credit = $profile('.image-credit').children();
        hatch.save_asset(main_image);

        const body = $profile('.post-content').first();

        //Download iframe videos 
        const iframe_videos = $profile("iframe").map(function() {
            const iframe_src = this.attribs.src;
            for (const video_iframe of video_iframes) {
                if (iframe_src.includes(video_iframe)) {
                    const video_url = new url.URL(this.attribs.src);
                    const full_uri = url.format(video_url, { search: false })
                    const video_asset = new libingester.VideoAsset();
                    video_asset.set_canonical_uri(full_uri);
                    video_asset.set_last_modified_date(modified_date);
                    video_asset.set_title(title);
                    video_asset.set_download_uri(full_uri);
                    hatch.save_asset(video_asset);
                }
            }
        });

        // download videos
        const videos = $profile('.wp-video').find('video a').map(function() {
            const video_url = this.attribs.href;
            const video_asset = new libingester.VideoAsset();
            video_asset.set_canonical_uri(video_url);
            video_asset.set_last_modified_date(modified_date);
            video_asset.set_title(title);
            video_asset.set_download_uri(video_url);
            hatch.save_asset(video_asset);
        });

        //remove elements
        for (const remove_element of remove_elements) {
            body.find(remove_element).remove();
        }

        //Download images 
        body.find("img").map(function() {
            if (this.attribs.src || this.attribs["data-src"]) {
                const image = libingester.util.download_img(this, base_uri);
                hatch.save_asset(image);
                this.attribs["data-libingester-asset-id"] = image.asset_id;
                for (const meta of remove_metadata) {
                    delete this.attribs[meta];
                }
            }
        });

        const content = mustache.render(template.structure_template, {
            title: title,
            article_entry: article_entry,
            main_image: main_image,
            image_credit: image_credit,
            body: body.html()
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